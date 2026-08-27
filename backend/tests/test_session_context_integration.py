"""Full session context integration test.

Simulates a complete planning session with 20 messages, blueprint edits,
diagrams, wireframes, decisions, and canvas sync, then verifies the
materialised directory state and total event count.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, Team
from src.app.models.project import Project
from src.app.models.session import Session
from src.app.models.session_event import SessionContext, SessionEvent
from src.app.models.user import User
from src.app.services.event_writer import (
    write_blueprint_event,
    write_canvas_sync_event,
    write_decision_event,
    write_diagram_event,
    write_message_event,
    write_wireframe_event,
)


async def _make_session(db: AsyncSession) -> str:
    """Insert minimal User / Org / Team / Project / Session rows and return the session id."""
    user = User(id=gen_uuid(), email=f"{gen_uuid()}@test.com", name="Test User")
    org = Organization(id=gen_uuid(), name="Integration Org", slug=gen_uuid()[:8])
    db.add_all([user, org])
    await db.flush()

    team = Team(id=gen_uuid(), org_id=org.id, name="Integration Team", slug=gen_uuid()[:8])
    db.add(team)
    await db.flush()

    project = Project(
        id=gen_uuid(),
        name="Integration Project",
        owner_id=user.id,
        org_id=org.id,
        team_id=team.id,
    )
    db.add(project)
    await db.flush()

    session = Session(
        id=gen_uuid(),
        project_id=project.id,
        org_id=org.id,
    )
    db.add(session)
    await db.flush()
    return session.id


@pytest.mark.anyio
async def test_full_session_simulation(db_session: AsyncSession):
    """Simulate a full session and verify the materialised directory."""
    session_id = await _make_session(db_session)

    # ── Step 1: Write 20 message events (alternating Alex/AI) ─────────────────
    for i in range(20):
        if i % 2 == 0:
            speaker = "Alex"
            mtype = "chat"
            source = "chat"
        else:
            speaker = "AI"
            mtype = "ai"
            source = "facilitator"
        await write_message_event(
            session_id=session_id,
            content=f"Message {i + 1} from {speaker}",
            message_type=mtype,
            speaker_name=speaker,
            source=source,
            db=db_session,
        )

    # ── Step 2: Write 2 blueprint edits (tech_stack, architecture) ────────────
    await write_blueprint_event(
        session_id=session_id,
        section="tech_stack",
        content="We will use React for the frontend and FastAPI for the backend.",
        db=db_session,
    )
    await write_blueprint_event(
        session_id=session_id,
        section="architecture",
        content="Microservices architecture with an API gateway and three core services.",
        db=db_session,
    )

    # ── Step 3: Write 1 diagram event (flow type) ─────────────────────────────
    await write_diagram_event(
        session_id=session_id,
        diagram_type="flow",
        title="System Architecture Flow",
        node_count=8,
        description="High-level architecture diagram",
        db=db_session,
    )

    # ── Step 4: Write 2 wireframe events ──────────────────────────────────────
    await write_wireframe_event(
        session_id=session_id,
        screen_name="Dashboard Screen",
        description="Main user dashboard",
        element_count=12,
        db=db_session,
    )
    await write_wireframe_event(
        session_id=session_id,
        screen_name="Settings Screen",
        description="User settings page",
        element_count=8,
        db=db_session,
    )

    # ── Step 5: Write 1 decision event ────────────────────────────────────────
    await write_decision_event(
        session_id=session_id,
        text="Adopt microservices architecture",
        rationale="Enables independent scaling and deployment of services",
        related_section="architecture",
        db=db_session,
    )

    # ── Step 6: Write 1 canvas sync event ─────────────────────────────────────
    await write_canvas_sync_event(
        session_id=session_id,
        element_count=30,
        types=["rectangle", "text", "arrow"],
        db=db_session,
    )

    # ── Verify: materialised directory ────────────────────────────────────────
    result = await db_session.execute(
        select(SessionContext)
        .where(SessionContext.session_id == session_id)
        .execution_options(populate_existing=True)
    )
    ctx = result.scalars().first()
    assert ctx is not None

    directory = ctx.directory

    # message_count == 20
    assert directory["session"]["message_count"] == 20, (
        f"Expected 20 messages, got {directory['session']['message_count']}"
    )

    # blueprint_coverage has tech_stack and architecture > 0
    coverage = directory["blueprint_coverage"]
    assert "tech_stack" in coverage, "tech_stack missing from blueprint_coverage"
    assert "architecture" in coverage, "architecture missing from blueprint_coverage"
    assert coverage["tech_stack"] > 0, "tech_stack coverage score should be > 0"
    assert coverage["architecture"] > 0, "architecture coverage score should be > 0"

    # artifacts has 3 entries: 1 flow diagram + 2 wireframes
    artifacts = directory["artifacts"]
    assert len(artifacts) == 3, f"Expected 3 artifacts, got {len(artifacts)}"
    artifact_types = [a["type"] for a in artifacts]
    assert "flow" in artifact_types, "Expected a 'flow' artifact"
    assert artifact_types.count("wireframe") == 2, "Expected 2 wireframe artifacts"

    # decisions has 1 entry with the correct text
    decisions = directory["decisions"]
    assert len(decisions) == 1, f"Expected 1 decision, got {len(decisions)}"
    assert decisions[0]["text"] == "Adopt microservices architecture"

    # canvas_elements == 30
    assert directory["session"]["canvas_elements"] == 30, (
        f"Expected canvas_elements=30, got {directory['session'].get('canvas_elements')}"
    )

    # ── Verify: total event count == 27 (20+2+1+2+1+1) ───────────────────────
    count_result = await db_session.execute(
        select(func.count()).where(SessionEvent.session_id == session_id)
    )
    total_events = count_result.scalar()
    assert total_events == 27, f"Expected 27 total events, got {total_events}"
