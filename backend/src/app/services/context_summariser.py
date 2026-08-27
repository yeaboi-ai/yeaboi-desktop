"""Async AI summariser for session context compression.

Compresses older conversation history into a rolling summary using Haiku.
Triggered when the count of unsummarised message events exceeds a threshold.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.session_event import SessionContext, SessionEvent
from .ai_provider import get_ai_client

logger = logging.getLogger(__name__)


async def maybe_summarise(
    session_id: str,
    db: AsyncSession,
    trigger_threshold: int = 15,
) -> bool:
    """Summarise older conversation if the unsummarised message count exceeds the threshold.

    Steps:
    1. Fetch the SessionContext for this session.
    2. Count unsummarised message events (after the watermark, or all if no watermark).
    3. If count < trigger_threshold, return False.
    4. Fetch all events since the watermark (all types).
    5. Build and call the summariser.
    6. Update ctx.summary and ctx.summary_through_event_id.
    7. Commit and return True.
    8. On any AI exception, log a warning and return False (non-blocking).
    """
    # 1. Get SessionContext
    result = await db.execute(select(SessionContext).where(SessionContext.session_id == session_id))
    ctx = result.scalars().first()
    if ctx is None:
        return False

    watermark_id = ctx.summary_through_event_id

    # 2. Count unsummarised message events
    if watermark_id is None:
        # No watermark — count all message events for this session
        watermark_event_created_at = None
    else:
        # Find the created_at of the watermark event
        wm_result = await db.execute(select(SessionEvent).where(SessionEvent.id == watermark_id))
        wm_event = wm_result.scalars().first()
        watermark_event_created_at = wm_event.created_at if wm_event else None

    if watermark_event_created_at is None:
        count_query = (
            select(func.count())
            .select_from(SessionEvent)
            .where(
                SessionEvent.session_id == session_id,
                SessionEvent.event_type == "message",
            )
        )
    else:
        count_query = (
            select(func.count())
            .select_from(SessionEvent)
            .where(
                SessionEvent.session_id == session_id,
                SessionEvent.event_type == "message",
                SessionEvent.created_at > watermark_event_created_at,
            )
        )

    count_result = await db.execute(count_query)
    unsummarised_count = count_result.scalar_one()

    # 3. Check threshold
    if unsummarised_count < trigger_threshold:
        return False

    # 4. Fetch all events since the watermark (all types, ordered by created_at)
    if watermark_event_created_at is None:
        events_query = (
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.created_at.asc())
        )
    else:
        events_query = (
            select(SessionEvent)
            .where(
                SessionEvent.session_id == session_id,
                SessionEvent.created_at > watermark_event_created_at,
            )
            .order_by(SessionEvent.created_at.asc())
        )

    events_result = await db.execute(events_query)
    events = events_result.scalars().all()

    if not events:
        return False

    # Convert events to dicts for the prompt builder
    event_dicts = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "source": e.source,
            "payload": e.payload,
            "summary": e.summary,
        }
        for e in events
    ]

    # 5. Build the prompt
    prompt = _build_summary_prompt(ctx.summary, event_dicts)

    # 6. Call the summariser (non-blocking on failure)
    try:
        new_summary = await _call_summariser(prompt)
    except Exception as exc:
        logger.warning("Context summariser AI call failed for session %s: %s", session_id, exc)
        return False

    # 7. Update the context
    ctx.summary = new_summary
    ctx.summary_through_event_id = events[-1].id

    # 8. Commit
    await db.commit()
    return True


def _build_summary_prompt(existing_summary: str | None, new_events: list[dict]) -> str:
    """Build the summarisation prompt from the existing summary and new events."""
    existing_part = existing_summary or "(No previous summary — this is the start of the session.)"

    event_lines = []
    for evt in new_events:
        # Use the event's summary field if available, otherwise fall back to payload content
        summary_text = evt.get("summary")
        if not summary_text:
            payload = evt.get("payload") or {}
            if "content" in payload:
                summary_text = payload["content"]
            elif "text" in payload:
                summary_text = payload["text"]
            elif "section" in payload and "content" in payload:
                summary_text = f"{payload['section']}: {payload['content']}"
            else:
                # Fallback: join non-empty string values from payload
                summary_text = " | ".join(str(v) for v in payload.values() if v) or "(no content)"
        event_lines.append(f"- [{evt['event_type']}] {summary_text}")

    events_part = "\n".join(event_lines) if event_lines else "(no events)"

    return (
        f"You are summarising a planning session. Here is the existing summary:\n"
        f"{existing_part}\n"
        f"\n"
        f"Here are the new events since the last summary:\n"
        f"{events_part}\n"
        f"\n"
        f"Write an updated summary that preserves all key decisions, topics discussed,\n"
        f"disagreements, and action items. Focus on WHAT was decided and WHY.\n"
        f"Keep under 800 tokens. Do not include verbatim quotes."
    )


async def _call_summariser(prompt: str) -> str:
    """Call the AI summariser (Haiku) with the given prompt and return the response text."""
    ai = await get_ai_client(None, None, task="fast")
    return await ai.chat(
        system="You are a concise planning session summariser.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=800,
    )
