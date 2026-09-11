"""Tests for the async context summariser service."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, Team
from src.app.models.session import Session
from src.app.models.session_event import SessionContext
from src.app.models.user import User
from src.app.services.context_summariser import _build_summary_prompt, maybe_summarise
from src.app.services.event_writer import write_message_event

# ─── Fixture helpers ──────────────────────────────────────────────────────────


async def _make_session(db: AsyncSession) -> str:
    """Insert minimal User / Org / Team / Session / Session rows and return the session id."""
    user = User(id=gen_uuid(), email=f"{gen_uuid()}@test.com", name="Test User")
    org = Organization(id=gen_uuid(), name="Test Org", slug=gen_uuid()[:8])
    db.add_all([user, org])
    await db.flush()

    team = Team(id=gen_uuid(), org_id=org.id, name="Test Team", slug=gen_uuid()[:8])
    db.add(team)
    await db.flush()

    project = Session(
        id=gen_uuid(),
        name="Test Session",
        owner_id=user.id,
        org_id=org.id,
        team_id=team.id,
    )
    db.add(project)
    await db.flush()

    session = Session(
        id=gen_uuid(),
        org_id=org.id,
    )
    db.add(session)
    await db.flush()
    return session.id


async def _write_n_messages(session_id: str, n: int, db: AsyncSession) -> None:
    """Write n message events for the given session."""
    for i in range(n):
        await write_message_event(
            session_id=session_id,
            content=f"Message {i + 1}: discussing the project requirements",
            message_type="chat",
            speaker_name="Alice" if i % 2 == 0 else "Bob",
            source="chat",
            db=db,
        )


# ─── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_no_summary_below_threshold(db_session: AsyncSession):
    """Writing 5 messages and calling maybe_summarise with threshold=15 should return False."""
    session_id = await _make_session(db_session)
    await _write_n_messages(session_id, 5, db_session)

    result = await maybe_summarise(session_id, db_session, trigger_threshold=15)

    assert result is False


@pytest.mark.anyio
async def test_summary_triggered_above_threshold(db_session: AsyncSession):
    """Writing 20 messages should trigger summarisation and return True."""
    session_id = await _make_session(db_session)
    await _write_n_messages(session_id, 20, db_session)

    mock_summary = "The team discussed project requirements and agreed on key features."

    with patch(
        "src.app.services.context_summariser._call_summariser",
        new=AsyncMock(return_value=mock_summary),
    ):
        result = await maybe_summarise(session_id, db_session, trigger_threshold=15)

    assert result is True

    # Verify the context was updated
    from sqlalchemy import select

    ctx_result = await db_session.execute(
        select(SessionContext)
        .where(SessionContext.session_id == session_id)
        .execution_options(populate_existing=True)
    )
    ctx = ctx_result.scalars().first()
    assert ctx is not None
    assert ctx.summary == mock_summary
    assert ctx.summary_through_event_id is not None


@pytest.mark.anyio
async def test_build_summary_prompt_no_existing_summary():
    """Prompt with no existing summary should use the start-of-session placeholder."""
    events = [
        {"event_type": "message", "payload": {"content": "Let's build a todo app"}, "summary": None},
        {"event_type": "decision", "payload": {"text": "Use PostgreSQL"}, "summary": "Decided on PostgreSQL"},
    ]
    prompt = _build_summary_prompt(None, events)

    assert "(No previous summary — this is the start of the session.)" in prompt
    assert "[message]" in prompt
    assert "[decision]" in prompt
    assert "Let's build a todo app" in prompt
    assert "Decided on PostgreSQL" in prompt


@pytest.mark.anyio
async def test_build_summary_prompt_with_existing_summary():
    """Prompt with an existing summary should include it verbatim."""
    existing = "Previously: the team agreed to use FastAPI and PostgreSQL."
    events = [
        {"event_type": "message", "payload": {"content": "What about the frontend?"}, "summary": None},
    ]
    prompt = _build_summary_prompt(existing, events)

    assert existing in prompt
    assert "[message]" in prompt
    assert "What about the frontend?" in prompt


@pytest.mark.anyio
async def test_summary_failure_is_non_blocking(db_session: AsyncSession):
    """If _call_summariser raises, maybe_summarise should return False without crashing."""
    session_id = await _make_session(db_session)
    await _write_n_messages(session_id, 20, db_session)

    with patch(
        "src.app.services.context_summariser._call_summariser",
        new=AsyncMock(side_effect=Exception("AI service unavailable")),
    ):
        result = await maybe_summarise(session_id, db_session, trigger_threshold=15)

    assert result is False

    # Context summary should remain None (no update was committed)
    from sqlalchemy import select

    ctx_result = await db_session.execute(
        select(SessionContext)
        .where(SessionContext.session_id == session_id)
        .execution_options(populate_existing=True)
    )
    ctx = ctx_result.scalars().first()
    assert ctx is not None
    assert ctx.summary is None
