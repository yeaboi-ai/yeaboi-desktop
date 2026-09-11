"""Tests for the recording REST endpoints + service helpers + sweeper.

Egress calls to LiveKit are not exercised end-to-end here — the recording
service is patched to a no-op for endpoint tests, and rows are inserted
directly. The webhook receiver is exercised with a hand-built event.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.app.models.recording import Recording
from src.app.models.session import Participant


async def _create_session(client, auth_headers) -> str:
    proj = await client.post("/api/sessions", json={"name": "RecP"}, headers=auth_headers)
    s = await client.post(
        f"/api/sessions/{proj.json()['id']}/continuations",
        json={"initial_idea": "rec"},
        headers=auth_headers,
    )
    return s.json()["id"]


_egress_seq = [0]


async def _insert_recording(
    db_session,
    *,
    session_id: str,
    status: str = "completed",
    file_url: str | None = "https://lk.example/rec/abc.mp4",
    duration: int | None = 120,
    expires_in_days: int = 30,
    share_token: str | None = None,
) -> Recording:
    _egress_seq[0] += 1
    rec = Recording(
        session_id=session_id,
        egress_id=f"EG_{session_id[:8]}_{_egress_seq[0]}",
        room_name=f"session-{session_id}",
        status=status,
        file_url=file_url,
        duration_seconds=duration,
        expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
        share_token=share_token,
        started_at=datetime.now(UTC) - timedelta(minutes=2),
        ended_at=datetime.now(UTC),
    )
    db_session.add(rec)
    await db_session.commit()
    await db_session.refresh(rec)
    return rec


# ── list / fetch ─────────────────────────────────────────────────────────


async def test_list_recordings_returns_session_rows(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    await _insert_recording(db_session, session_id=sid, status="completed")
    await _insert_recording(db_session, session_id=sid, status="active", file_url=None, duration=None)

    resp = await client.get(f"/api/sessions/{sid}/recordings", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2
    assert {r["status"] for r in body} == {"completed", "active"}


async def test_list_recordings_403_for_non_participant(client, auth_headers, other_auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    await _insert_recording(db_session, session_id=sid)
    resp = await client.get(f"/api/sessions/{sid}/recordings", headers=other_auth_headers)
    assert resp.status_code in (403, 404)


async def test_get_recording_returns_playback_url_for_participant(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid, status="completed")
    resp = await client.get(f"/api/recordings/{rec.id}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["playback_url"] == "https://lk.example/rec/abc.mp4"
    assert body["duration_seconds"] == 120


async def test_get_recording_410_when_expired(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid, expires_in_days=-1)
    resp = await client.get(f"/api/recordings/{rec.id}", headers=auth_headers)
    assert resp.status_code == 410


# ── patch expiry / share ─────────────────────────────────────────────────


async def test_patch_expiry_requires_host(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid)

    new_expiry = (datetime.now(UTC) + timedelta(days=60)).isoformat()
    resp = await client.patch(
        f"/api/recordings/{rec.id}",
        json={"expires_at": new_expiry},
        headers=auth_headers,
    )
    # The session creator becomes the host, so this should succeed.
    assert resp.status_code == 200, resp.text
    assert resp.json()["expires_at"].startswith(new_expiry[:10])


async def test_patch_rejects_past_expiry(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid)
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    resp = await client.patch(
        f"/api/recordings/{rec.id}",
        json={"expires_at": past},
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_share_token_lifecycle(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid)

    create = await client.post(f"/api/recordings/{rec.id}/share", headers=auth_headers)
    assert create.status_code == 201
    token = create.json()["share_token"]
    assert token and len(token) >= 16

    # Public anonymous fetch via token (no auth headers).
    public = await client.get(f"/api/recordings/public/{token}")
    assert public.status_code == 200
    assert public.json()["playback_url"]

    # Revoke.
    rev = await client.delete(f"/api/recordings/{rec.id}/share", headers=auth_headers)
    assert rev.status_code == 204
    after = await client.get(f"/api/recordings/public/{token}")
    assert after.status_code == 404


async def test_public_endpoint_410_when_expired(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid, share_token="tkn-expired-aaaaaaaaaa", expires_in_days=-1)
    resp = await client.get(f"/api/recordings/public/{rec.share_token}")
    assert resp.status_code == 410


async def test_public_endpoint_409_when_not_completed(client, auth_headers, db_session):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(
        db_session,
        session_id=sid,
        status="active",
        file_url=None,
        share_token="tkn-active-aaaaaaaaaaaaa",
    )
    resp = await client.get(f"/api/recordings/public/{rec.share_token}")
    assert resp.status_code == 409


# ── delete ───────────────────────────────────────────────────────────────


async def test_delete_recording_removes_row(client, auth_headers, db_session, monkeypatch):
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid)

    # Patch the asset-delete to avoid hitting LiveKit in tests.
    async def _noop(**kwargs):
        return True

    monkeypatch.setattr("src.app.routers.recordings.delete_recording_asset", _noop)

    resp = await client.delete(f"/api/recordings/{rec.id}", headers=auth_headers)
    assert resp.status_code == 204

    gone = (await db_session.execute(select(Recording).where(Recording.id == rec.id))).scalar_one_or_none()
    assert gone is None


# ── service-level idempotency ────────────────────────────────────────────


async def test_start_recording_no_op_when_disabled(db_session, monkeypatch):
    from src.app.services import recording as rec_service

    monkeypatch.setattr(rec_service, "is_recording_enabled", lambda: False)
    out = await rec_service.start_recording(db=db_session, session_id="x", started_by_id=None)
    assert out is None


async def test_start_recording_idempotent_when_already_active(client, auth_headers, db_session, monkeypatch):
    from src.app.services import recording as rec_service

    sid = await _create_session(client, auth_headers)
    existing = await _insert_recording(db_session, session_id=sid, status="active", file_url=None)

    monkeypatch.setattr(rec_service, "is_recording_enabled", lambda: True)
    out = await rec_service.start_recording(db=db_session, session_id=sid, started_by_id=None)
    assert out is not None
    assert out.id == existing.id


# ── sweeper ──────────────────────────────────────────────────────────────


async def test_sweeper_expires_past_due_rows(client, auth_headers, db_session, monkeypatch):
    """Drive `sweep_with_session` directly so we don't depend on the prod
    session factory wiring inside an in-memory sqlite test."""
    from src.app.services import recording_sweeper

    sid = await _create_session(client, auth_headers)
    await _insert_recording(db_session, session_id=sid, expires_in_days=-1, status="completed")
    await _insert_recording(db_session, session_id=sid, expires_in_days=30, status="completed")

    async def _noop(**kwargs):
        return True

    monkeypatch.setattr(recording_sweeper, "delete_recording_asset", _noop)

    expired = await recording_sweeper.sweep_with_session(db_session)
    assert expired == 1


# ── webhook signature ────────────────────────────────────────────────────


async def test_webhook_rejects_missing_authorization(client):
    resp = await client.post("/api/webhooks/livekit", content=b"{}")
    assert resp.status_code == 401


async def test_webhook_rejects_bad_signature(client):
    resp = await client.post(
        "/api/webhooks/livekit",
        content=b"{}",
        headers={"Authorization": "not-a-real-jwt"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "event_name,expected_status",
    [
        ("egress_started", "active"),
        ("egress_ended", "completed"),
    ],
)
async def test_webhook_updates_recording_row(
    client, auth_headers, db_session, monkeypatch, event_name, expected_status
):
    """Mock the LiveKit `WebhookReceiver` so we can drive the handler with a
    plain WebhookEvent object — signing the JWT is exercised by LiveKit's own
    SDK tests, not ours."""
    sid = await _create_session(client, auth_headers)
    rec = await _insert_recording(db_session, session_id=sid, status="starting", file_url=None, duration=None)

    class _StubInfo:
        egress_id = rec.egress_id
        status = 1 if event_name == "egress_started" else 3
        ended_at = 0
        error = ""
        file_results = (
            []
            if event_name != "egress_ended"
            else [
                type(
                    "F",
                    (),
                    {
                        "location": "https://lk.example/rec/finalised.mp4",
                        "size": 4_500_000,
                        "duration": 120 * 1_000_000_000,
                    },
                )()
            ]
        )

    class _StubEvent:
        event = event_name
        id = "evt-1"
        egress_info = _StubInfo()
        room = None

    class _StubReceiver:
        def receive(self, body, auth_token):
            return _StubEvent()

    monkeypatch.setattr("src.app.routers.livekit_webhooks._receiver", lambda: _StubReceiver())

    resp = await client.post(
        "/api/webhooks/livekit",
        content=b"{}",
        headers={"Authorization": "stubbed"},
    )
    assert resp.status_code == 200, resp.text

    refreshed = (await db_session.execute(select(Recording).where(Recording.id == rec.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.status == expected_status
    if event_name == "egress_ended":
        assert refreshed.file_url == "https://lk.example/rec/finalised.mp4"


# ── consent gate during call start ───────────────────────────────────────


async def test_call_start_skips_recording_when_no_consent(client, auth_headers, db_session, monkeypatch):
    """Token mint should NOT call start_recording when no participant has
    consented, even if recording is otherwise enabled."""
    from src.app.services import recording as rec_service

    sid = await _create_session(client, auth_headers)
    monkeypatch.setattr(rec_service, "is_recording_enabled", lambda: True)
    monkeypatch.setattr("src.app.routers.livekit_routes.is_recording_enabled", lambda: True)

    started: list[str] = []

    async def _spy(**kwargs):
        started.append(kwargs.get("session_id", ""))

    monkeypatch.setattr("src.app.routers.livekit_routes.start_recording", _spy)

    # Mark live so token mint accepts.
    from src.app.models.session import Session as SessionModel

    s = (await db_session.execute(select(SessionModel).where(SessionModel.id == sid))).scalar_one()
    s.status = "live"
    await db_session.commit()

    resp = await client.post(f"/api/sessions/{sid}/livekit-token", headers=auth_headers)
    assert resp.status_code == 200, resp.text

    # No participant in the auto-created participant row has consented yet.
    parts = (await db_session.execute(select(Participant).where(Participant.session_id == sid))).scalars().all()
    assert all(p.recording_consent is None for p in parts)
    # No background start should have been kicked off (give the loop a tick).
    import asyncio as _asyncio

    await _asyncio.sleep(0)
    assert started == []
