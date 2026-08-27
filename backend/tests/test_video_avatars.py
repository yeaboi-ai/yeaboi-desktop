import pytest


@pytest.mark.anyio
async def test_list_video_avatars_empty(client, auth_headers):
    resp = await client.get("/api/video-avatars", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_create_video_avatar_admin_succeeds(client, auth_headers):
    resp = await client.post(
        "/api/video-avatars",
        json={
            "name": "Test Anna",
            "description": "Tester",
            "provider": "tavus",
            "replica_id": "r79e1c033f",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Test Anna"
    assert body["replica_id"] == "r79e1c033f"
    assert body["provider"] == "tavus"
    assert body["is_system"] is False

    listing = await client.get("/api/video-avatars", headers=auth_headers)
    assert listing.status_code == 200
    assert any(a["id"] == body["id"] for a in listing.json())


@pytest.mark.anyio
async def test_update_video_avatar(client, auth_headers):
    create_resp = await client.post(
        "/api/video-avatars",
        json={"name": "Old Name", "provider": "tavus", "replica_id": "r1"},
        headers=auth_headers,
    )
    avatar_id = create_resp.json()["id"]
    resp = await client.patch(
        f"/api/video-avatars/{avatar_id}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.anyio
async def test_delete_video_avatar(client, auth_headers):
    create_resp = await client.post(
        "/api/video-avatars",
        json={"name": "To Delete", "provider": "tavus", "replica_id": "r2"},
        headers=auth_headers,
    )
    avatar_id = create_resp.json()["id"]

    delete = await client.delete(f"/api/video-avatars/{avatar_id}", headers=auth_headers)
    assert delete.status_code == 204

    listing = await client.get("/api/video-avatars", headers=auth_headers)
    assert all(a["id"] != avatar_id for a in listing.json())


@pytest.mark.anyio
async def test_invalid_provider_rejected(client, auth_headers):
    resp = await client.post(
        "/api/video-avatars",
        json={"name": "Bad", "provider": "made_up", "replica_id": "r3"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_unauthenticated_rejected(client):
    resp = await client.get("/api/video-avatars")
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_persona_accepts_video_avatar_id(client, auth_headers):
    avatar_resp = await client.post(
        "/api/video-avatars",
        json={"name": "Linked", "provider": "tavus", "replica_id": "r4"},
        headers=auth_headers,
    )
    avatar_id = avatar_resp.json()["id"]

    persona_resp = await client.post(
        "/api/blueprint-personas",
        json={
            "name": "Custom Persona",
            "system_prompt": "Be concise and helpful.",
            "focus_sections": [],
            "video_avatar_id": avatar_id,
        },
        headers=auth_headers,
    )
    assert persona_resp.status_code == 201, persona_resp.text
    assert persona_resp.json()["video_avatar_id"] == avatar_id


@pytest.mark.anyio
async def test_persona_rejects_unknown_video_avatar_id(client, auth_headers):
    persona_resp = await client.post(
        "/api/blueprint-personas",
        json={
            "name": "Bad Persona",
            "system_prompt": "Be concise.",
            "focus_sections": [],
            "video_avatar_id": "00000000-0000-0000-0000-000000000000",
        },
        headers=auth_headers,
    )
    assert persona_resp.status_code == 400
