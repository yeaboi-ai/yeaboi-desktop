"""W3.2.4 — internal /messages endpoint optionally accepts AI metadata
(model, latency_ms, reason) and stashes it in the attachments JSON for
the frontend reasoning peek."""

from src.app.config import get_settings


async def _create_session(client, auth_headers) -> str:
    proj = await client.post("/api/projects", json={"name": "MetaP"}, headers=auth_headers)
    sess = await client.post(
        f"/api/projects/{proj.json()['id']}/sessions",
        json={"initial_idea": "meta"},
        headers=auth_headers,
    )
    return sess.json()["id"]


async def test_internal_message_without_meta_has_no_attachments(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    settings = get_settings()

    resp = await client.post(
        "/api/internal/messages",
        json={
            "session_id": session_id,
            "content": "Hello",
            "message_type": "ai",
            "speaker_name": "Senior Engineer",
        },
        headers={"X-Internal-Secret": settings.internal_api_secret},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["attachments"] in (None, [])


async def test_internal_message_with_meta_packs_into_attachments(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    settings = get_settings()

    resp = await client.post(
        "/api/internal/messages",
        json={
            "session_id": session_id,
            "content": "Try this approach.",
            "message_type": "ai",
            "speaker_name": "Senior Engineer",
            "model": "claude-haiku-4-5",
            "latency_ms": 432,
            "reason": "Recommended a smaller first slice based on stated time constraints.",
        },
        headers={"X-Internal-Secret": settings.internal_api_secret},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["attachments"], "attachments should hold AI meta"
    meta = body["attachments"][0]["_ai_meta"]
    assert meta["model"] == "claude-haiku-4-5"
    assert meta["latency_ms"] == 432
    assert meta["reason"].startswith("Recommended")


async def test_agent_intent_requires_secret(client):
    """W3.2.5 — endpoint rejects missing internal secret."""
    resp = await client.post("/api/internal/agent-intent", json={"session_id": "x", "intent": "ask"})
    assert resp.status_code in (401, 403, 422)


async def test_agent_intent_broadcasts(client, auth_headers):
    """Returns 200 when secret is correct. WS broadcast is fire-and-forget."""
    session_id = await _create_session(client, auth_headers)
    settings = get_settings()

    resp = await client.post(
        "/api/internal/agent-intent",
        json={"session_id": session_id, "intent": "ask about scope", "eta_ms": 4000},
        headers={"X-Internal-Secret": settings.internal_api_secret},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
