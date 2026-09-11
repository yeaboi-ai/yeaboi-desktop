"""Tests for the context reader service."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, Team
from src.app.models.session import Session
from src.app.models.user import User
from src.app.services.context_reader import (
    get_artifact,
    get_decisions,
    get_recent_messages,
    get_session_directory,
    get_session_summary,
    search_session,
)
from src.app.services.event_writer import (
    write_blueprint_event,
    write_decision_event,
    write_diagram_event,
    write_message_event,
)

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


@pytest.fixture
async def seeded_session(db_session: AsyncSession):
    """Create a session with 5 messages, 1 blueprint edit, 1 diagram, and 1 decision."""
    session_id = await _make_session(db_session)

    # Write 5 message events
    speakers = ["Alice", "AI", "Alice", "AI", "Alice"]
    msg_types = ["chat", "ai", "chat", "ai", "chat"]
    for i, (speaker, mtype) in enumerate(zip(speakers, msg_types)):
        await write_message_event(
            session_id=session_id,
            content=f"Message {i + 1} from {speaker}",
            message_type=mtype,
            speaker_name=speaker,
            source="chat" if mtype == "chat" else "facilitator",
            db=db_session,
        )

    # Write 1 blueprint edit
    await write_blueprint_event(
        session_id=session_id,
        section="tech_stack",
        content="We will use PostgreSQL as the primary database for ACID compliance.",
        db=db_session,
    )

    # Write 1 diagram event
    diagram_event = await write_diagram_event(
        session_id=session_id,
        diagram_type="flow",
        title="User Auth Flow",
        node_count=6,
        description="Authentication flow diagram",
        db=db_session,
    )

    # Write 1 decision event
    await write_decision_event(
        session_id=session_id,
        text="Use PostgreSQL for the database",
        rationale="ACID compliance and team familiarity",
        related_section="tech_stack",
        db=db_session,
    )

    return {"session_id": session_id, "diagram_event_id": diagram_event.id}


# ─── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_session_directory(db_session: AsyncSession, seeded_session: dict):
    """Directory should reflect 5 messages and blueprint coverage for tech_stack."""
    session_id = seeded_session["session_id"]
    directory = await get_session_directory(session_id, db_session)

    assert directory is not None
    assert directory["session"]["message_count"] == 5
    assert "tech_stack" in directory["blueprint_coverage"]
    assert directory["blueprint_coverage"]["tech_stack"] > 0


@pytest.mark.anyio
async def test_get_artifact(db_session: AsyncSession, seeded_session: dict):
    """Fetching the diagram event by ID should return its payload."""
    diagram_event_id = seeded_session["diagram_event_id"]
    payload = await get_artifact(diagram_event_id, db_session)

    assert payload is not None
    assert payload["diagram_type"] == "flow"
    assert payload["title"] == "User Auth Flow"
    assert payload["node_count"] == 6


@pytest.mark.anyio
async def test_search_session(db_session: AsyncSession, seeded_session: dict):
    """Searching for 'PostgreSQL' should find the blueprint event summary."""
    session_id = seeded_session["session_id"]

    # Write an event with a searchable summary
    from src.app.services.event_writer import write_event

    await write_event(
        session_id=session_id,
        event_type="system",
        source="system",
        payload={"info": "note"},
        db=db_session,
        summary="PostgreSQL selected as the primary database",
    )

    results = await search_session(session_id, "PostgreSQL", db_session)
    assert len(results) > 0
    assert any("PostgreSQL" in (r["summary"] or "") for r in results)


@pytest.mark.anyio
async def test_get_decisions(db_session: AsyncSession, seeded_session: dict):
    """Should return 1 decision with the correct text."""
    session_id = seeded_session["session_id"]
    decisions = await get_decisions(session_id, db_session)

    assert len(decisions) == 1
    d = decisions[0]
    assert d["text"] == "Use PostgreSQL for the database"
    assert d["rationale"] == "ACID compliance and team familiarity"
    assert d["related_section"] == "tech_stack"


@pytest.mark.anyio
async def test_get_recent_messages(db_session: AsyncSession, seeded_session: dict):
    """Should return 3 messages (the limit), each with the required keys."""
    session_id = seeded_session["session_id"]
    messages = await get_recent_messages(session_id, limit=3, db=db_session)

    assert len(messages) == 3
    # Each entry has the expected keys
    for msg in messages:
        assert "speaker_name" in msg
        assert "content" in msg
        assert "message_type" in msg
    # All speakers should be one of the expected values
    speakers = {msg["speaker_name"] for msg in messages}
    assert speakers.issubset({"Alice", "AI"})
    # All content entries come from the seeded messages
    contents = {msg["content"] for msg in messages}
    assert all(c.startswith("Message ") for c in contents)


@pytest.mark.anyio
async def test_get_session_directory_missing(db_session: AsyncSession):
    """Nonexistent session should return None."""
    result = await get_session_directory("nonexistent-session-id", db_session)
    assert result is None


@pytest.mark.anyio
async def test_get_session_summary_missing(db_session: AsyncSession):
    """Nonexistent session should return None for summary."""
    result = await get_session_summary("nonexistent-session-id", db_session)
    assert result is None
