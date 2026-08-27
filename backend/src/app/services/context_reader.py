from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.session_event import SessionContext, SessionEvent

logger = logging.getLogger(__name__)


async def get_session_directory(session_id: str, db: AsyncSession) -> dict | None:
    """Return the materialised directory JSON, or None if no context exists."""
    result = await db.execute(
        select(SessionContext).where(SessionContext.session_id == session_id)
    )
    ctx = result.scalars().first()
    if ctx is None:
        return None
    return ctx.directory


async def get_session_summary(session_id: str, db: AsyncSession) -> str | None:
    """Return the rolling AI summary text."""
    result = await db.execute(
        select(SessionContext).where(SessionContext.session_id == session_id)
    )
    ctx = result.scalars().first()
    if ctx is None:
        return None
    return ctx.summary


async def get_artifact(event_id: str, db: AsyncSession) -> dict | None:
    """Fetch the full payload of a specific event by its ID."""
    result = await db.execute(
        select(SessionEvent).where(SessionEvent.id == event_id)
    )
    event = result.scalars().first()
    if event is None:
        return None
    return event.payload


async def search_session(
    session_id: str, query: str, db: AsyncSession, limit: int = 5
) -> list[dict]:
    """Search event summaries via ILIKE text match. Return top matches by recency.

    Returns list of {"id", "event_type", "summary", "payload"} dicts.
    """
    # SQLite uses LIKE (case-insensitive by default for ASCII); PostgreSQL uses ILIKE.
    # Use the SQLAlchemy ilike() method which maps to ILIKE on PostgreSQL and
    # case-insensitive LIKE on SQLite.
    result = await db.execute(
        select(SessionEvent)
        .where(
            SessionEvent.session_id == session_id,
            SessionEvent.summary.ilike(f"%{query}%"),
        )
        .order_by(SessionEvent.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "summary": e.summary,
            "payload": e.payload,
        }
        for e in events
    ]


async def get_decisions(session_id: str, db: AsyncSession) -> list[dict]:
    """Fetch all decision events.

    Returns list of {"id", "text", "rationale", "related_section"} dicts.
    """
    result = await db.execute(
        select(SessionEvent)
        .where(
            SessionEvent.session_id == session_id,
            SessionEvent.event_type == "decision",
        )
        .order_by(SessionEvent.created_at.asc())
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "text": e.payload.get("text", ""),
            "rationale": e.payload.get("rationale", ""),
            "related_section": e.payload.get("related_section", ""),
        }
        for e in events
    ]


async def get_recent_messages(
    session_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """Fetch N most recent message events, ordered oldest-first.

    Returns list of {"speaker_name", "content", "message_type"} dicts.
    """
    # Fetch the N most recent messages in descending order, then reverse in Python
    # to present them oldest-first. This works consistently across SQLite and PostgreSQL.
    result = await db.execute(
        select(SessionEvent)
        .where(
            SessionEvent.session_id == session_id,
            SessionEvent.event_type == "message",
        )
        .order_by(SessionEvent.created_at.desc(), SessionEvent.id.desc())
        .limit(limit)
    )
    events = list(reversed(result.scalars().all()))
    return [
        {
            "speaker_name": e.payload.get("speaker_name", ""),
            "content": e.payload.get("content", ""),
            "message_type": e.payload.get("message_type", ""),
        }
        for e in events
    ]
