from __future__ import annotations

import copy
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..models.session_event import SessionContext, SessionEvent
from .context_materialiser import EMPTY_DIRECTORY, materialise

logger = logging.getLogger(__name__)


async def write_event(
    session_id: str,
    event_type: str,
    source: str,
    payload: dict,
    db: AsyncSession,
    summary: str | None = None,
) -> SessionEvent:
    """Create a SessionEvent row, upsert the SessionContext, run the materialiser, and commit.

    Returns the persisted SessionEvent.
    """
    event = SessionEvent(
        session_id=session_id,
        event_type=event_type,
        source=source,
        payload=payload,
        summary=summary,
    )
    db.add(event)
    await db.flush()  # assign event.id before materialising

    # Get or create SessionContext
    result = await db.execute(select(SessionContext).where(SessionContext.session_id == session_id))
    ctx = result.scalars().first()
    if ctx is None:
        # Materialise into a fresh directory before the INSERT so the row carries the
        # correct state from the start (avoids a same-transaction INSERT+UPDATE issue
        # where SQLAlchemy omits the UPDATE for newly-added objects).
        from types import SimpleNamespace

        stub = SimpleNamespace(directory=copy.deepcopy(EMPTY_DIRECTORY), id="_stub")
        materialise(stub, event)
        ctx = SessionContext(
            session_id=session_id,
            directory=copy.deepcopy(stub.directory),
        )
        db.add(ctx)
        await db.flush()
    else:
        # Existing context: materialise, reassign, and call flag_modified so SQLAlchemy
        # reliably marks the JSON column dirty and emits the UPDATE on flush.
        materialise(ctx, event)
        ctx.directory = copy.deepcopy(ctx.directory)
        flag_modified(ctx, "directory")
        await db.flush()

    await db.commit()
    await db.refresh(event)
    await db.refresh(ctx)
    return event


# ─── Typed helper wrappers ────────────────────────────────────────────────────


async def write_message_event(
    session_id: str,
    content: str,
    message_type: str,
    speaker_name: str,
    source: str,
    db: AsyncSession,
    message_id: str | None = None,
    user_id: str | None = None,
) -> SessionEvent:
    """Write a chat/voice message event."""
    payload: dict = {
        "content": content,
        "message_type": message_type,
        "speaker_name": speaker_name,
    }
    if message_id is not None:
        payload["message_id"] = message_id
    if user_id is not None:
        payload["user_id"] = user_id
    return await write_event(session_id, "message", source, payload, db)


async def write_blueprint_event(
    session_id: str,
    section: str,
    content: str,
    db: AsyncSession,
) -> SessionEvent:
    """Write a blueprint section edit event."""
    payload = {"section": section, "content": content}
    return await write_event(session_id, "blueprint_edit", "facilitator", payload, db)


async def write_diagram_event(
    session_id: str,
    diagram_type: str,
    title: str,
    node_count: int,
    description: str,
    db: AsyncSession,
) -> SessionEvent:
    """Write a diagram update event."""
    payload = {
        "diagram_type": diagram_type,
        "title": title,
        "node_count": node_count,
        "description": description,
    }
    return await write_event(session_id, "diagram_update", "canvas_ws", payload, db)


async def write_wireframe_event(
    session_id: str,
    screen_name: str,
    description: str,
    element_count: int,
    db: AsyncSession,
) -> SessionEvent:
    """Write a wireframe generated event."""
    payload = {
        "screen_name": screen_name,
        "description": description,
        "element_count": element_count,
    }
    return await write_event(session_id, "wireframe_generated", "facilitator", payload, db)


async def write_decision_event(
    session_id: str,
    text: str,
    rationale: str,
    related_section: str,
    db: AsyncSession,
) -> SessionEvent:
    """Write a decision event."""
    payload = {"text": text, "rationale": rationale, "related_section": related_section}
    return await write_event(session_id, "decision", "facilitator", payload, db)


async def write_canvas_sync_event(
    session_id: str,
    element_count: int,
    types: list[str],
    db: AsyncSession,
) -> SessionEvent:
    """Write a canvas sync event."""
    payload = {"element_count": element_count, "types": types}
    return await write_event(session_id, "canvas_sync", "canvas_ws", payload, db)
