"""Tests for the graceful agent detach endpoint and shared service flow."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.config import get_settings


def _agent_participant(identity: str = "agent-1"):
    return SimpleNamespace(identity=identity, kind=1)


def _human_participant(identity: str = "user-1"):
    return SimpleNamespace(identity=identity, kind=0)


def _make_lk_client(participants_responses: list[list], remove_raises: bool = False) -> MagicMock:
    """Build a mock LiveKitAPI client whose list_participants returns the next
    pre-canned response on each call. send_data and remove_participant are
    AsyncMocks that record calls."""
    lk = MagicMock()
    lk.room = MagicMock()
    lk.room.send_data = AsyncMock()

    if remove_raises:
        lk.room.remove_participant = AsyncMock(side_effect=Exception("kick failed"))
    else:
        lk.room.remove_participant = AsyncMock()

    queue = list(participants_responses)

    async def _list_participants(_req):
        next_batch = queue.pop(0) if queue else []
        return SimpleNamespace(participants=next_batch)

    lk.room.list_participants = AsyncMock(side_effect=_list_participants)
    return lk


def _patch_livekit_api(lk_client: MagicMock):
    """Returns a patcher that makes `api.LiveKitAPI(...)` an async context
    manager yielding the given mock client."""

    @asynccontextmanager
    async def _ctx(*_args, **_kwargs):
        yield lk_client

    return patch("src.app.services.livekit_service.api.LiveKitAPI", side_effect=_ctx)


@pytest.fixture(autouse=True)
def _fast_grace(monkeypatch):
    """Cap the detach grace period at 1s and speed up the poll interval so
    tests don't sit through the production 5s wait."""
    monkeypatch.setenv("LIVEKIT_DETACH_GRACE_SECONDS", "1")
    get_settings.cache_clear()


async def _create_session(client, auth_headers) -> str:
    proj = await client.post("/api/sessions", json={"name": "P"}, headers=auth_headers)
    sess = await client.post(
        f"/api/sessions/{proj.json()['id']}/continuations",
        json={"initial_idea": "Test"},
        headers=auth_headers,
    )
    return sess.json()["id"]


async def test_detach_requires_auth(client):
    resp = await client.post("/api/sessions/abc/detach-agent", json={})
    # 401 without JWT, 403 if it parses but rejects.
    assert resp.status_code in (401, 403)


async def test_detach_noop_when_no_agent(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    lk = _make_lk_client([[_human_participant()]])
    with (
        _patch_livekit_api(lk),
        patch("src.app.services.livekit_service._broadcast_agent_status", new_callable=AsyncMock) as broadcast,
    ):
        resp = await client.post(f"/api/sessions/{session_id}/detach-agent", json={}, headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"detached": True, "method": "noop", "removed": []}
    lk.room.send_data.assert_not_called()
    lk.room.remove_participant.assert_not_called()
    broadcast.assert_not_called()


async def test_detach_graceful_when_agent_leaves_on_signal(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    # First list call → agent present (initial scan)
    # Second list call → agent gone (graceful)
    lk = _make_lk_client(
        [
            [_agent_participant("agent-XYZ"), _human_participant()],
            [_human_participant()],
        ]
    )

    with (
        _patch_livekit_api(lk),
        patch("src.app.services.livekit_service._broadcast_agent_status", new_callable=AsyncMock) as broadcast,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/detach-agent",
            json={"say_goodbye": True},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["method"] == "graceful"
    assert body["removed"] == ["agent-XYZ"]
    lk.room.send_data.assert_awaited_once()
    sent_req = lk.room.send_data.await_args.args[0]
    assert sent_req.topic == "agent_control"
    assert sent_req.destination_identities == ["agent-XYZ"]
    lk.room.remove_participant.assert_not_called()
    broadcast.assert_not_called()  # graceful path doesn't synthesize


async def test_detach_forced_when_agent_lingers(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    # Every list call returns the agent — never leaves on its own.
    # Provide enough entries to outlast the polling loop (1s / 0.5s ≈ 2 polls
    # plus the initial scan plus the post-force list).
    agent = _agent_participant("agent-stuck")
    lk = _make_lk_client(
        [
            [agent, _human_participant()],
            [agent, _human_participant()],
            [agent, _human_participant()],
            [agent, _human_participant()],
            [agent, _human_participant()],
        ]
    )

    with (
        _patch_livekit_api(lk),
        patch("src.app.services.livekit_service._broadcast_agent_status", new_callable=AsyncMock) as broadcast,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/detach-agent",
            json={"say_goodbye": False},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["method"] == "forced"
    assert body["removed"] == ["agent-stuck"]
    lk.room.send_data.assert_awaited_once()
    lk.room.remove_participant.assert_awaited_once()
    broadcast.assert_awaited_once()
    args = broadcast.await_args.args
    assert args == (session_id, "detached")


async def test_detach_multiple_agents_all_signaled_and_removed(client, auth_headers):
    session_id = await _create_session(client, auth_headers)

    a1 = _agent_participant("agent-1")
    a2 = _agent_participant("agent-2")
    # Both linger so we hit the forced path and verify both are removed.
    lk = _make_lk_client(
        [
            [a1, a2, _human_participant()],
            [a1, a2],
            [a1, a2],
            [a1, a2],
        ]
    )

    with (
        _patch_livekit_api(lk),
        patch("src.app.services.livekit_service._broadcast_agent_status", new_callable=AsyncMock),
    ):
        resp = await client.post(f"/api/sessions/{session_id}/detach-agent", json={}, headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["method"] == "forced"
    assert set(body["removed"]) == {"agent-1", "agent-2"}
    assert lk.room.send_data.await_count == 2
    assert lk.room.remove_participant.await_count == 2


async def test_internal_detach_requires_secret(client):
    resp = await client.post("/api/internal/detach-agent", json={"session_id": "x"})
    assert resp.status_code in (401, 403, 422)


async def test_internal_detach_with_secret(client, auth_headers):
    session_id = await _create_session(client, auth_headers)
    settings = get_settings()

    lk = _make_lk_client([[]])  # no agents → noop
    with _patch_livekit_api(lk):
        resp = await client.post(
            "/api/internal/detach-agent",
            json={"session_id": session_id},
            headers={"X-Internal-Secret": settings.internal_api_secret},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"detached": True, "method": "noop", "removed": []}
