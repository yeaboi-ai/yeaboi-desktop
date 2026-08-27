import pytest

FEEDBACK_URL = "/api/feedback"


def _feedback_body(**overrides):
    base = {
        "target_type": "chat_message",
        "target_id": "msg-001",
        "session_id": None,
        "agent_type": "chat",
        "rating": "thumbs_up",
    }
    base.update(overrides)
    return base


@pytest.mark.anyio
async def test_submit_feedback(client, auth_headers):
    resp = await client.post(FEEDBACK_URL, json=_feedback_body(), headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["rating"] == "thumbs_up"
    assert data["target_type"] == "chat_message"
    assert data["target_id"] == "msg-001"
    assert data["agent_type"] == "chat"
    assert data["id"]


@pytest.mark.anyio
async def test_submit_feedback_upsert(client, auth_headers):
    """Submitting feedback for the same target updates the existing entry."""
    resp1 = await client.post(FEEDBACK_URL, json=_feedback_body(rating="thumbs_up"), headers=auth_headers)
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]

    resp2 = await client.post(FEEDBACK_URL, json=_feedback_body(rating="thumbs_down"), headers=auth_headers)
    assert resp2.status_code == 201
    id2 = resp2.json()["id"]
    assert id2 == id1
    assert resp2.json()["rating"] == "thumbs_down"


@pytest.mark.anyio
async def test_submit_feedback_with_comment(client, auth_headers):
    body = _feedback_body(comment="Very helpful response", rating="thumbs_up")
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["comment"] == "Very helpful response"


@pytest.mark.anyio
async def test_submit_feedback_with_context(client, auth_headers):
    body = _feedback_body(context={"persona": "pm", "language": "en"})
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["context"]["persona"] == "pm"


@pytest.mark.anyio
async def test_list_feedback(client, auth_headers):
    await client.post(FEEDBACK_URL, json=_feedback_body(target_id="msg-a"), headers=auth_headers)
    await client.post(FEEDBACK_URL, json=_feedback_body(target_id="msg-b", rating="thumbs_down"), headers=auth_headers)

    resp = await client.get(FEEDBACK_URL, headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 2


@pytest.mark.anyio
async def test_list_feedback_filter_by_agent_type(client, auth_headers):
    await client.post(FEEDBACK_URL, json=_feedback_body(target_id="msg-c", agent_type="chat"), headers=auth_headers)
    await client.post(
        FEEDBACK_URL,
        json=_feedback_body(target_id="msg-d", agent_type="voice", target_type="voice_response"),
        headers=auth_headers,
    )

    resp = await client.get(FEEDBACK_URL, params={"agent_type": "voice"}, headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert all(item["agent_type"] == "voice" for item in items)


@pytest.mark.anyio
async def test_feedback_summary(client, auth_headers):
    await client.post(FEEDBACK_URL, json=_feedback_body(target_id="s-1", rating="thumbs_up"), headers=auth_headers)
    await client.post(FEEDBACK_URL, json=_feedback_body(target_id="s-2", rating="thumbs_down"), headers=auth_headers)
    await client.post(
        FEEDBACK_URL,
        json=_feedback_body(target_id="s-3", rating="thumbs_up", comment="Great!"),
        headers=auth_headers,
    )

    resp = await client.get(f"{FEEDBACK_URL}/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 3
    assert data["thumbs_up"] >= 2
    assert data["thumbs_down"] >= 1
    assert data["with_comments"] >= 1
    assert "chat" in data["by_agent_type"]


@pytest.mark.anyio
async def test_retract_feedback(client, auth_headers):
    resp = await client.post(FEEDBACK_URL, json=_feedback_body(target_id="del-1"), headers=auth_headers)
    feedback_id = resp.json()["id"]

    del_resp = await client.delete(f"{FEEDBACK_URL}/{feedback_id}", headers=auth_headers)
    assert del_resp.status_code == 204


@pytest.mark.anyio
async def test_retract_nonexistent_returns_404(client, auth_headers):
    resp = await client.delete(f"{FEEDBACK_URL}/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_unauthenticated_returns_401(client):
    resp = await client.post(FEEDBACK_URL, json=_feedback_body())
    assert resp.status_code in (401, 403)

    resp = await client.get(FEEDBACK_URL)
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_invalid_rating_returns_422(client, auth_headers):
    body = _feedback_body(rating="five_stars")
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_invalid_target_type_returns_422(client, auth_headers):
    body = _feedback_body(target_type="invalid_type")
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_voice_feedback(client, auth_headers):
    body = _feedback_body(
        target_type="voice_response",
        target_id="transcript-001",
        agent_type="voice",
        rating="thumbs_down",
    )
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["target_type"] == "voice_response"
    assert resp.json()["agent_type"] == "voice"


@pytest.mark.anyio
async def test_session_feedback(client, auth_headers):
    body = _feedback_body(
        target_type="session",
        target_id="session-001",
        agent_type="voice",
        rating="thumbs_up",
        comment="Great planning session!",
    )
    resp = await client.post(FEEDBACK_URL, json=body, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["target_type"] == "session"
    assert resp.json()["comment"] == "Great planning session!"
