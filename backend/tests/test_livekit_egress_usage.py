"""Tests for LiveKit egress webhook → usage_event recording.

The egress webhook is the single insertion point for LiveKit recording cost,
so we exercise `_handle_egress_event` directly with synthetic event objects
rather than spinning up the full HTTP+JWT-verification path.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from src.app.models.project import Project
from src.app.models.recording import Recording
from src.app.models.session import Session
from src.app.models.usage_event import UsageEvent
from src.app.routers.livekit_webhooks import _handle_egress_event


@pytest.fixture
async def project(db_session, sample_org, sample_team, sample_user):
    proj = Project(
        org_id=sample_org.id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="LK Test",
    )
    db_session.add(proj)
    await db_session.commit()
    await db_session.refresh(proj)
    return proj


@pytest.fixture
async def session_row(db_session, project, sample_org):
    s = Session(project_id=project.id, org_id=sample_org.id, status="active")
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


@pytest.fixture
async def recording_row(db_session, session_row):
    started = datetime.now(UTC) - timedelta(minutes=10)
    rec = Recording(
        session_id=session_row.id,
        egress_id="EG_test_1",
        room_name=f"session-{session_row.id}",
        status="active",
        started_at=started,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db_session.add(rec)
    await db_session.commit()
    await db_session.refresh(rec)
    return rec


def _ended_event(egress_id: str, *, status: int = 3, duration_ns: int = 600 * 1_000_000_000) -> SimpleNamespace:
    """Build a SimpleNamespace shaped like a LiveKit `WebhookEvent` for an
    `egress_ended` notification. We only access the attributes the handler
    actually reads — keeps the fixture honest about the contract."""
    info = SimpleNamespace(
        egress_id=egress_id,
        status=status,
        ended_at=int(datetime.now(UTC).timestamp() * 1_000_000_000),
        error=None,
        file_results=[SimpleNamespace(location="https://example/file.mp4", size=1_000_000, duration=duration_ns)],
    )
    return SimpleNamespace(event="egress_ended", id="evt-1", egress_info=info, room=None)


class TestEgressUsageRecording:
    async def test_completed_egress_writes_usage_event(self, db_session, recording_row, sample_org, project):
        # 600s of duration → 10 minutes × $0.0075/min = $0.075
        await _handle_egress_event(db_session, _ended_event(recording_row.egress_id))

        events = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert len(events) == 1
        ev = events[0]
        assert ev.provider == "livekit"
        assert ev.operation == "egress"
        assert ev.org_id == sample_org.id
        assert ev.project_id == project.id
        assert ev.session_id == recording_row.session_id
        assert ev.units == {"seconds": 600}
        assert ev.cost_usd == Decimal("0.075000")
        assert ev.source == "webhook"
        assert ev.event_metadata == {
            "egress_id": recording_row.egress_id,
            "recording_id": recording_row.id,
        }

    async def test_failed_egress_does_not_record(self, db_session, recording_row):
        # status=4 (FAILED) — recording row is marked failed; no usage written.
        await _handle_egress_event(db_session, _ended_event(recording_row.egress_id, status=4))
        events = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert events == []

    async def test_unknown_egress_id_ignored(self, db_session):
        await _handle_egress_event(db_session, _ended_event("EG_does_not_exist"))
        events = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert events == []

    async def test_started_event_does_not_record(self, db_session, recording_row):
        # status=1 (ACTIVE) — the row stays "active"; recording is mid-stream,
        # we'd be premature to bill.
        started_evt = SimpleNamespace(
            event="egress_started",
            id="evt-2",
            egress_info=SimpleNamespace(
                egress_id=recording_row.egress_id,
                status=1,
                ended_at=None,
                error=None,
                file_results=[],
            ),
            room=None,
        )
        await _handle_egress_event(db_session, started_evt)
        events = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert events == []
