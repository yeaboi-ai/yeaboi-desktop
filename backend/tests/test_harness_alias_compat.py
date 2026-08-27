"""Existing /harness/* endpoints must continue returning their documented shapes,
even though internally they now go through OutputService."""


async def _create_project(client, auth_headers, name="Compat"):
    resp = await client.post("/api/projects", json={"name": name}, headers=auth_headers)
    return resp.json()


async def test_harness_preview_still_returns_files_shape(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.get(
        f"/api/projects/{project['id']}/harness/preview", headers=auth_headers
    )
    assert resp.status_code == 200
    assert set(resp.json().keys()) == {"files"}


async def test_harness_generate_returns_status_shape(client, auth_headers, monkeypatch):
    from src.app.services import output_service

    async def fake_generate_scaffold(name, content):
        return {"AGENTS.md": "x"}

    monkeypatch.setattr(output_service, "generate_scaffold", fake_generate_scaffold)

    project = await _create_project(client, auth_headers)
    resp = await client.post(
        f"/api/projects/{project['id']}/harness/generate",
        json={"create_repo": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # HarnessStatusResponse shape: id, project_id, status, repo_url, repo_name, created_at
    assert {"id", "project_id", "status", "repo_url", "repo_name", "created_at"} <= set(body.keys())
    assert body["project_id"] == project["id"]
    assert body["status"] == "complete"  # mapped from project_outputs 'ready'


async def test_harness_status_after_generate(client, auth_headers, monkeypatch):
    from src.app.services import output_service

    async def fake_generate_scaffold(name, content):
        return {"AGENTS.md": "x"}

    monkeypatch.setattr(output_service, "generate_scaffold", fake_generate_scaffold)

    project = await _create_project(client, auth_headers)
    await client.post(
        f"/api/projects/{project['id']}/harness/generate",
        json={"create_repo": False},
        headers=auth_headers,
    )
    resp = await client.get(
        f"/api/projects/{project['id']}/harness/status", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "complete"


async def test_harness_status_404_when_never_generated(client, auth_headers):
    """Existing behaviour: 404 if no harness has been generated yet."""
    project = await _create_project(client, auth_headers)
    resp = await client.get(
        f"/api/projects/{project['id']}/harness/status", headers=auth_headers
    )
    assert resp.status_code == 404
