import pytest


@pytest.mark.anyio
async def test_get_setting_not_found(client, auth_headers):
    resp = await client.get("/api/app-settings", params={"key": "nonexistent"}, headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_put_creates_setting(client, auth_headers):
    resp = await client.put(
        "/api/app-settings",
        json={"key": "test_key", "value": "test_value"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "test_key"
    assert data["value"] == "test_value"


@pytest.mark.anyio
async def test_get_returns_saved_setting(client, auth_headers):
    await client.put(
        "/api/app-settings",
        json={"key": "my_pref", "value": '{"layout": [1,2,3]}'},
        headers=auth_headers,
    )
    resp = await client.get("/api/app-settings", params={"key": "my_pref"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["value"] == '{"layout": [1,2,3]}'


@pytest.mark.anyio
async def test_put_upserts_existing(client, auth_headers):
    await client.put(
        "/api/app-settings",
        json={"key": "color", "value": "blue"},
        headers=auth_headers,
    )
    resp = await client.put(
        "/api/app-settings",
        json={"key": "color", "value": "red"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "red"

    get_resp = await client.get("/api/app-settings", params={"key": "color"}, headers=auth_headers)
    assert get_resp.json()["value"] == "red"


@pytest.mark.anyio
async def test_unauthenticated_returns_401(client):
    resp = await client.get("/api/app-settings", params={"key": "anything"})
    assert resp.status_code in (401, 403)

    resp = await client.put("/api/app-settings", json={"key": "k", "value": "v"})
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_user_isolation(client, auth_headers, other_auth_headers):
    await client.put(
        "/api/app-settings",
        json={"key": "secret", "value": "user1_data"},
        headers=auth_headers,
    )
    resp = await client.get("/api/app-settings", params={"key": "secret"}, headers=other_auth_headers)
    assert resp.status_code == 404

    await client.put(
        "/api/app-settings",
        json={"key": "secret", "value": "user2_data"},
        headers=other_auth_headers,
    )
    resp1 = await client.get("/api/app-settings", params={"key": "secret"}, headers=auth_headers)
    resp2 = await client.get("/api/app-settings", params={"key": "secret"}, headers=other_auth_headers)
    assert resp1.json()["value"] == "user1_data"
    assert resp2.json()["value"] == "user2_data"


@pytest.mark.anyio
async def test_put_invalid_body(client, auth_headers):
    resp = await client.put(
        "/api/app-settings",
        json={"key": "k"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
