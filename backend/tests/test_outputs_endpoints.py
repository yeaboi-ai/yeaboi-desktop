async def _create_project(client, auth_headers, name="Out P"):
    resp = await client.post("/api/projects", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201
    return resp.json()


async def test_list_outputs_returns_catalogue(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.get(f"/api/projects/{project['id']}/outputs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    types = {e["output_type"] for e in data}
    assert types == {"code_scaffold", "design_bundle", "terraform_stack", "decision_doc"}
    # All start not_generated on a fresh project
    assert all(e["status"] == "not_generated" for e in data)


async def test_get_single_output_404_when_never_generated(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.get(
        f"/api/projects/{project['id']}/outputs/code_scaffold", headers=auth_headers
    )
    assert resp.status_code == 404


async def test_generate_code_scaffold_happy_path(client, auth_headers, monkeypatch):
    """POST generate creates/updates a row and returns it."""
    from src.app.services import output_service

    async def fake_generate_scaffold(name, content):
        return {"AGENTS.md": "hi"}

    monkeypatch.setattr(output_service, "generate_scaffold", fake_generate_scaffold)

    project = await _create_project(client, auth_headers)
    resp = await client.post(
        f"/api/projects/{project['id']}/outputs/code_scaffold/generate",
        json={"payload": {"create_repo": False}},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ready"
    assert body["output_type"] == "code_scaffold"


async def test_generate_unknown_type_400(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.post(
        f"/api/projects/{project['id']}/outputs/mystery/generate",
        json={"payload": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_generate_slot_type_501(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.post(
        f"/api/projects/{project['id']}/outputs/terraform_stack/generate",
        json={"payload": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 501


async def test_preview_code_scaffold(client, auth_headers):
    project = await _create_project(client, auth_headers)
    resp = await client.get(
        f"/api/projects/{project['id']}/outputs/code_scaffold/preview", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "files" in data
    assert isinstance(data["files"], dict)
