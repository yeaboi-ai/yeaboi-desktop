"""Tests for the historical usage_events back-fill."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.app.models.project import Project
from src.app.models.recording import Recording
from src.app.models.session import ChatMessage, Participant, Session, TranscriptEntry
from src.app.models.usage_event import UsageEvent
from src.app.services.usage_backfill import backfill_org_usage


@pytest.fixture
async def project(db_session, sample_org, sample_team, sample_user):
    proj = Project(
        org_id=sample_org.id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Backfill Test",
    )
    db_session.add(proj)
    await db_session.commit()
    await db_session.refresh(proj)
    return proj


@pytest.fixture
async def session_with_history(db_session, project, sample_org, sample_user):
    s = Session(
        project_id=project.id,
        org_id=sample_org.id,
        status="completed",
        ai_config={"model": "claude-opus-4-7"},
    )
    db_session.add(s)
    await db_session.flush()

    db_session.add_all(
        [
            ChatMessage(session_id=s.id, content="Hi facilitator", message_type="chat"),
            ChatMessage(session_id=s.id, content="x" * 800, message_type="ai", audio_url="https://x/a.mp3"),
            ChatMessage(session_id=s.id, content="Another user line", message_type="chat"),
            ChatMessage(session_id=s.id, content="y" * 400, message_type="ai"),
        ]
    )
    db_session.add(Participant(session_id=s.id, user_id=sample_user.id, role="host", recording_consent=True))
    db_session.add_all(
        [
            TranscriptEntry(session_id=s.id, text="hello there how are you", is_final=True),
            TranscriptEntry(session_id=s.id, text="I am fine thanks", is_final=True),
        ]
    )
    db_session.add(
        Recording(
            session_id=s.id,
            egress_id="EG_back_1",
            room_name=f"session-{s.id}",
            status="completed",
            duration_seconds=300,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
    )
    await db_session.commit()
    return s


class TestBackfill:
    async def test_dry_run_writes_nothing(self, db_session, sample_org, session_with_history):
        counts = await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=True)
        assert counts.sessions_scanned == 1
        assert counts.rows_written > 0  # would-have-been counted
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert rows == []

    async def test_writes_rows_with_estimated_flag(self, db_session, sample_org, session_with_history):
        counts = await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        assert counts.sessions_scanned == 1
        assert counts.rows_written >= 1

        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert all(r.is_estimated for r in rows)
        assert all(r.source == "backfill" for r in rows)

    async def test_creates_expected_provider_rows(self, db_session, sample_org, session_with_history):
        await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        providers = {(r.provider, r.operation) for r in rows}
        # All four estimators should fire for the seeded session.
        assert ("anthropic", "chat") in providers
        assert ("elevenlabs", "tts") in providers
        assert ("livekit", "egress") in providers
        assert ("deepgram", "stt") in providers

    async def test_anthropic_units_match_message_chars(self, db_session, sample_org, session_with_history):
        await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        anth = (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.provider == "anthropic", UsageEvent.operation == "chat")
            )
        ).scalar_one()
        # User chars: "Hi facilitator" (14) + "Another user line" (17) = 31 → 7 tokens
        assert anth.units["tokens_in"] == 31 // 4
        # AI chars: 800 + 400 = 1200 → 300 tokens
        assert anth.units["tokens_out"] == 1200 // 4
        assert anth.model == "claude-opus-4-7"

    async def test_elevenlabs_only_counts_messages_with_audio(self, db_session, sample_org, session_with_history):
        await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        el = (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.provider == "elevenlabs", UsageEvent.operation == "tts")
            )
        ).scalar_one()
        # Only the AI message with audio_url contributed (800 chars).
        assert el.units["characters"] == 800

    async def test_livekit_uses_recording_duration(self, db_session, sample_org, session_with_history):
        await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        lk = (
            await db_session.execute(
                select(UsageEvent).where(UsageEvent.provider == "livekit", UsageEvent.operation == "egress")
            )
        ).scalar_one()
        assert lk.units["seconds"] == 300

    async def test_idempotent_rerun(self, db_session, sample_org, session_with_history):
        first = await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        before = (await db_session.execute(select(UsageEvent))).scalars().all()
        second = await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        after = (await db_session.execute(select(UsageEvent))).scalars().all()
        # Re-run skips every row that already exists; no new inserts.
        assert len(before) == len(after)
        assert second.rows_written == 0
        assert first.rows_written > 0

    async def test_session_without_data_skipped(self, db_session, sample_org, project):
        # Empty session — no messages, no recordings, no transcripts.
        empty = Session(project_id=project.id, org_id=sample_org.id, status="created")
        db_session.add(empty)
        await db_session.commit()
        counts = await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        rows = (await db_session.execute(select(UsageEvent))).scalars().all()
        assert rows == []
        assert counts.sessions_scanned == 1

    async def test_other_org_data_untouched(self, db_session, sample_org, session_with_history):
        # Add a row that already exists for an unrelated org — backfill must
        # leave it intact.
        from src.app.models.organization import Organization

        other = Organization(name="Other Org", slug="other-bf")
        db_session.add(other)
        await db_session.flush()
        existing = UsageEvent(
            org_id=other.id,
            provider="anthropic",
            operation="chat",
            units={"tokens_in": 1, "tokens_out": 1},
            cost_usd=Decimal("0.001"),
            is_estimated=False,
            source="api",
        )
        db_session.add(existing)
        await db_session.commit()

        await backfill_org_usage(db_session, org_id=sample_org.id, dry_run=False)
        # The other-org row is untouched.
        kept = (await db_session.execute(select(UsageEvent).where(UsageEvent.org_id == other.id))).scalar_one()
        assert kept.id == existing.id
