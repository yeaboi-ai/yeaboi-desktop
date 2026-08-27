from datetime import UTC


async def test_unauthenticated_request_returns_401(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 401


async def test_valid_jwt_returns_user(client, auth_headers):
    resp = await client.get("/api/projects", headers=auth_headers)
    assert resp.status_code == 200


async def test_expired_jwt_returns_401(client, expired_auth_headers):
    resp = await client.get("/api/projects", headers=expired_auth_headers)
    assert resp.status_code == 401


async def test_jwt_without_email_returns_401(client):
    from datetime import datetime, timedelta

    import jwt as pyjwt

    token = pyjwt.encode(
        {"name": "No Email", "exp": datetime.now(tz=UTC) + timedelta(hours=1)},
        "test-secret",
        algorithm="HS256",
    )
    resp = await client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
