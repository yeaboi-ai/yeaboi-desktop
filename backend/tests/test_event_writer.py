"""Tests for the event writer service."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, Team
from src.app.models.session import Session
from src.app.models.session_event import SessionContext, SessionEvent
from src.app.models.user import User
from src.app.services.event_writer import (
    write_blueprint_event,
    write_event,
    write_message_event,
)

# ─── Shared fixture helpers ───────────────────────────────────────────────────


async def _make_session(db) -> str:
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


# ─── write_event ──────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_write_event_creates_event_and_context(db_session):
    """Writing one message event should create exactly one event row and one context row
    with message_count=1."""
    session_id = await _make_session(db_session)

    event = await write_event(
        session_id=session_id,
        event_type="message",
        source="chat",
        payload={"content": "Hello world"},
        db=db_session,
    )

    assert event.id is not None
    assert event.event_type == "message"
    assert event.session_id == session_id

    # Verify the context row was created (populate_existing bypasses the identity-map cache)
    result = await db_session.execute(
        select(SessionContext)
        .where(SessionContext.session_id == session_id)
        .execution_options(populate_existing=True)
    )
    ctx = result.scalars().first()
    assert ctx is not None
    assert ctx.directory["session"]["message_count"] == 1


@pytest.mark.anyio
async def test_write_event_increments_message_count(db_session):
    """Writing 2 message events should produce message_count=2 in the context."""
    session_id = await _make_session(db_session)

    await write_event(session_id, "message", "chat", {"content": "First"}, db_session)
    await write_event(session_id, "message", "chat", {"content": "Second"}, db_session)

    result = await db_session.execute(select(SessionContext).where(SessionContext.session_id == session_id))
    ctx = result.scalars().first()
    assert ctx.directory["session"]["message_count"] == 2


# ─── Helper wrappers ──────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_write_message_event_helper(db_session):
    """write_message_event should produce event_type='message' and a correct payload."""
    session_id = await _make_session(db_session)

    event = await write_message_event(
        session_id=session_id,
        content="Hello from helper",
        message_type="chat",
        speaker_name="Alice",
        source="chat",
        db=db_session,
    )

    assert event.event_type == "message"
    assert event.payload["content"] == "Hello from helper"
    assert event.payload["message_type"] == "chat"
    assert event.payload["speaker_name"] == "Alice"

    # Verify event was persisted
    result = await db_session.execute(select(SessionEvent).where(SessionEvent.id == event.id))
    persisted = result.scalars().first()
    assert persisted is not None


@pytest.mark.anyio
async def test_write_blueprint_event_helper(db_session):
    """write_blueprint_event should update blueprint_coverage in the directory."""
    session_id = await _make_session(db_session)

    event = await write_blueprint_event(
        session_id=session_id,
        section="project_overview",
        content="Build a task management tool for engineering teams to track sprints.",
        db=db_session,
    )

    assert event.event_type == "blueprint_edit"
    assert event.payload["section"] == "project_overview"

    result = await db_session.execute(select(SessionContext).where(SessionContext.session_id == session_id))
    ctx = result.scalars().first()
    assert "project_overview" in ctx.directory["blueprint_coverage"]
    score = ctx.directory["blueprint_coverage"]["project_overview"]
    assert isinstance(score, int)
    assert 0 <= score <= 100
