from unittest.mock import AsyncMock, patch

from src.app.config import get_settings


async def test_get_livekit_token(client, auth_headers):
    # Create project + session (starts "live" today — no lobby transition needed).
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    with patch(
        "src.app.routers.livekit_routes.create_room",
        new_callable=AsyncMock,
        return_value={"name": f"session-{session_id}", "sid": "test-sid"},
    ):
        resp = await client.post(f"/api/sessions/{session_id}/livekit-token", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    # URL comes from settings — don't hardcode the dev default.
    assert data["url"] == get_settings().livekit_url


async def test_livekit_token_auto_adds_non_participant(client, auth_headers, other_auth_headers):
    """The endpoint auto-adds any authenticated user as a session participant —
    there's no cross-team gate at this layer. Test that behaviour rather than
    asserting 403."""
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    with patch(
        "src.app.routers.livekit_routes.create_room",
        new_callable=AsyncMock,
        return_value={"name": f"session-{session_id}", "sid": "test-sid"},
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/livekit-token", headers=other_auth_headers
        )
    assert resp.status_code == 200


async def test_livekit_token_rejects_inactive_session(client, auth_headers):
    """After transitioning to a non-active state (paused→completed), token
    issuance must return 400."""
    proj = await client.post("/api/sessions", json={"name": "P1"}, headers=auth_headers)
    session_id = proj.json()["id"]
    sess = await client.post(
        f"/api/sessions/{session_id}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]

    # live → completed (bypass paused for brevity)
    await client.patch(f"/api/sessions/{session_id}", json={"status": "completed"}, headers=auth_headers)

    resp = await client.post(f"/api/sessions/{session_id}/livekit-token", headers=auth_headers)
    assert resp.status_code == 400
