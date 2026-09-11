from unittest.mock import AsyncMock, patch

# ── helpers ──────────────────────────────────────────────────────────────────


async def _create_project(client, auth_headers, name: str = "Test Session") -> dict:
    resp = await client.post("/api/sessions", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201
    return resp.json()


# ── tests ─────────────────────────────────────────────────────────────────────


async def test_harness_preview_returns_file_tree(client, auth_headers):
    """Preview returns a dict of scaffold files without creating a repo."""
    project = await _create_project(client, auth_headers)
    session_id = project["id"]

    resp = await client.get(f"/api/sessions/{session_id}/harness/preview", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "files" in data
    files = data["files"]
    assert isinstance(files, dict)
    assert "AGENTS.md" in files
    assert "ARCHITECTURE.md" in files
    assert ".github/workflows/ci.yml" in files
    assert "docs/PLANS.md" in files


async def test_harness_preview_with_blueprint_content(client, auth_headers):
    """Preview incorporates blueprint content in rendered templates."""
    project = await _create_project(client, auth_headers, name="Blueprint Session")
    session_id = project["id"]

    # Set some blueprint content
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "An AI-powered planning tool for dev teams"},
        headers=auth_headers,
    )
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/tech_stack",
        json={"content": "Next.js + FastAPI + Python"},
        headers=auth_headers,
    )

    resp = await client.get(f"/api/sessions/{session_id}/harness/preview", headers=auth_headers)
    assert resp.status_code == 200
    files = resp.json()["files"]

    assert "Blueprint Session" in files["AGENTS.md"]
    assert "An AI-powered planning tool for dev teams" in files["AGENTS.md"]
    # tech_stack contains "python" → CI should have pytest step
    assert "pytest" in files[".github/workflows/ci.yml"]


async def test_harness_generate_creates_config_record(client, auth_headers):
    """POST generate creates a HarnessConfig record and returns status."""
    project = await _create_project(client, auth_headers)
    session_id = project["id"]

    resp = await client.post(
        f"/api/sessions/{session_id}/harness/generate",
        json={"repo_name": "my-project-scaffold", "create_repo": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == session_id
    assert data["status"] == "complete"
    assert data["repo_name"] == "my-project-scaffold"
    assert data["repo_url"] is None  # no GitHub token provided


async def test_harness_status_returns_config(client, auth_headers):
    """GET status returns the harness config after generation."""
    project = await _create_project(client, auth_headers)
    session_id = project["id"]

    # Generate first
    await client.post(
        f"/api/sessions/{session_id}/harness/generate",
        json={"repo_name": "status-test-repo", "create_repo": False},
        headers=auth_headers,
    )

    resp = await client.get(f"/api/sessions/{session_id}/harness/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == session_id
    assert data["status"] == "complete"
    assert data["repo_name"] == "status-test-repo"


async def test_harness_status_404_if_never_generated(client, auth_headers):
    """GET status returns 404 when no harness has been generated."""
    project = await _create_project(client, auth_headers)
    session_id = project["id"]

    resp = await client.get(f"/api/sessions/{session_id}/harness/status", headers=auth_headers)
    assert resp.status_code == 404


async def test_harness_generate_with_github_creates_repo(client, auth_headers):
    """POST generate with github_token calls create_github_repo."""
    project = await _create_project(client, auth_headers)
    session_id = project["id"]

    with patch(
        "src.app.services.output_service.create_github_repo",
        new=AsyncMock(return_value="https://github.com/user/my-repo"),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/harness/generate",
            json={"repo_name": "my-repo", "github_token": "ghp_fake", "create_repo": True},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "complete"
    assert data["repo_url"] == "https://github.com/user/my-repo"


async def test_harness_preview_empty_blueprint_graceful(client, auth_headers):
    """Preview works even when blueprint has no content (uses defaults)."""
    project = await _create_project(client, auth_headers, name="Empty Blueprint Session")
    session_id = project["id"]

    resp = await client.get(f"/api/sessions/{session_id}/harness/preview", headers=auth_headers)
    assert resp.status_code == 200
    files = resp.json()["files"]

    # Should still have all key files
    assert "AGENTS.md" in files
    assert "ARCHITECTURE.md" in files
    # Empty blueprint → default domain included
    assert "core" in files["AGENTS.md"]
