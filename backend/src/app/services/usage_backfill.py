"""Historical back-fill for the `usage_events` ledger.

Most pre-existing sessions have no per-provider usage rows because
instrumentation didn't exist when they ran. This module synthesises
*estimated* events from data we already store so the analytics dashboard
isn't missing months of history. All synthesised rows carry
`is_estimated=true` and `source='backfill'` so the UI can mark them.

The estimators are intentionally conservative — under-counting is preferable
to inventing spend that didn't happen. Heuristics:

- **Anthropic input tokens** ≈ `len(joined user/system messages) // 4`.
  Mirrors Anthropic's own "1 token ≈ 4 chars of English" guidance.
- **Anthropic output tokens** ≈ `len(ai ChatMessage.content) // 4`.
- **ElevenLabs characters** ≈ sum of AI message lengths where `audio_url`
  is set (proxy for "this AI message was spoken").
- **Deepgram seconds** ≈ `Recording.duration_seconds` if any voice
  participants exist; otherwise `sum(len(transcript_entry.text))/15` as a
  speaking-rate approximation.
- **LiveKit egress seconds** ≈ `Recording.duration_seconds`.

Idempotency: the `(session_id, provider, operation) WHERE source='backfill'`
partial unique index makes re-runs safe — repeated rows error and we skip.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.recording import Recording
from ..models.session import ChatMessage, Participant, Session, TranscriptEntry
from ..models.usage_event import UsageEvent
from .usage_costs import compute_cost

logger = logging.getLogger(__name__)


@dataclass
class BackfillCounts:
    """Lightweight summary returned to callers (script + admin endpoint)."""

    sessions_scanned: int = 0
    rows_written: int = 0
    rows_skipped_existing: int = 0
    estimated_cost_usd: Decimal = Decimal("0")

    def to_dict(self) -> dict:
        return {
            "sessions_scanned": self.sessions_scanned,
            "rows_written": self.rows_written,
            "rows_skipped_existing": self.rows_skipped_existing,
            "estimated_cost_usd": float(self.estimated_cost_usd),
        }


# Average chars per token across English prose. Anthropic's own quoting.
_CHARS_PER_TOKEN = 4
# Avg chars-per-second of speech for the Deepgram fallback estimator (~150
# wpm × ~5 chars/word / 60). Conservative — short voice notes will still
# round to a few seconds.
_CHARS_PER_SECOND = 15


async def _existing_backfill_keys(db: AsyncSession, session_id: str) -> set[tuple[str, str]]:
    """Return the (provider, operation) keys this session already has a
    backfill row for — used to skip without relying on integrity errors."""
    rows = (
        await db.execute(
            select(UsageEvent.provider, UsageEvent.operation).where(
                UsageEvent.session_id == session_id,
                UsageEvent.source == "backfill",
            )
        )
    ).all()
    return {(r.provider, r.operation) for r in rows}


async def _model_for_session(session: Session) -> str | None:
    """Pull the model name from the session's ai_config if present, else
    fall back to a reasonable default. Returns None if no signal at all."""
    cfg = session.ai_config or {}
    model = cfg.get("model")
    if isinstance(model, str) and model:
        return model
    return "claude-sonnet-4-6"


async def _estimate_session(
    db: AsyncSession,
    session: Session,
    counts: BackfillCounts,
    *,
    dry_run: bool,
    backfill_run_id: str,
) -> None:
    """Synthesise usage_event rows for one session. Adds to *counts* in
    place. Caller commits."""
    existing = await _existing_backfill_keys(db, session.id)

    # ── Anthropic chat: input/output tokens from message text lengths ──
    if ("anthropic", "chat") not in existing:
        msgs = (
            await db.execute(
                select(ChatMessage.content, ChatMessage.message_type).where(ChatMessage.session_id == session.id)
            )
        ).all()
        ai_chars = sum(len(m.content or "") for m in msgs if m.message_type in ("ai", "voice_ai"))
        user_chars = sum(len(m.content or "") for m in msgs if m.message_type in ("chat", "voice_chat"))
        if ai_chars or user_chars:
            tokens_in = user_chars // _CHARS_PER_TOKEN
            tokens_out = ai_chars // _CHARS_PER_TOKEN
            model = await _model_for_session(session)
            await _record_estimate(
                db,
                session=session,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": tokens_in, "tokens_out": tokens_out},
                model=model,
                counts=counts,
                dry_run=dry_run,
                backfill_run_id=backfill_run_id,
            )

    # ── ElevenLabs TTS: characters from AI messages with audio_url ─────
    if ("elevenlabs", "tts") not in existing:
        spoken_chars = (
            await db.execute(
                select(func.coalesce(func.sum(func.length(ChatMessage.content)), 0)).where(
                    ChatMessage.session_id == session.id,
                    ChatMessage.audio_url.isnot(None),
                )
            )
        ).scalar() or 0
        if spoken_chars > 0:
            await _record_estimate(
                db,
                session=session,
                provider="elevenlabs",
                operation="tts",
                units={"characters": int(spoken_chars)},
                model=None,
                counts=counts,
                dry_run=dry_run,
                backfill_run_id=backfill_run_id,
            )

    # ── Recording-based estimates (LiveKit egress + Deepgram STT) ──────
    rec_duration = (
        await db.execute(
            select(func.coalesce(func.max(Recording.duration_seconds), 0)).where(
                Recording.session_id == session.id, Recording.status == "completed"
            )
        )
    ).scalar() or 0

    voice_participant_count = (
        await db.execute(
            select(func.count()).where(Participant.session_id == session.id, Participant.recording_consent.is_(True))
        )
    ).scalar() or 0

    if ("livekit", "egress") not in existing and rec_duration > 0:
        await _record_estimate(
            db,
            session=session,
            provider="livekit",
            operation="egress",
            units={"seconds": int(rec_duration)},
            model=None,
            counts=counts,
            dry_run=dry_run,
            backfill_run_id=backfill_run_id,
        )

    if ("deepgram", "stt") not in existing:
        seconds = 0
        if rec_duration > 0 and voice_participant_count > 0:
            seconds = int(rec_duration)
        else:
            transcript_chars = (
                await db.execute(
                    select(func.coalesce(func.sum(func.length(TranscriptEntry.text)), 0)).where(
                        TranscriptEntry.session_id == session.id, TranscriptEntry.is_final.is_(True)
                    )
                )
            ).scalar() or 0
            if transcript_chars > 0:
                seconds = int(transcript_chars / _CHARS_PER_SECOND)
        if seconds > 0:
            await _record_estimate(
                db,
                session=session,
                provider="deepgram",
                operation="stt",
                units={"seconds": seconds},
                model=None,
                counts=counts,
                dry_run=dry_run,
                backfill_run_id=backfill_run_id,
            )


async def _record_estimate(
    db: AsyncSession,
    *,
    session: Session,
    provider: str,
    operation: str,
    units: dict,
    model: str | None,
    counts: BackfillCounts,
    dry_run: bool,
    backfill_run_id: str,
) -> None:
    cost = compute_cost(provider, operation, units, model=model)
    if dry_run:
        counts.rows_written += 1
        counts.estimated_cost_usd += cost
        return
    event = UsageEvent(
        org_id=session.org_id,
        session_id=session.id,
        provider=provider,
        operation=operation,
        model=model,
        units=units,
        cost_usd=cost,
        is_estimated=True,
        source="backfill",
        occurred_at=session.updated_at or session.created_at or datetime.now(UTC),
        event_metadata={"backfill_run_id": backfill_run_id},
    )
    db.add(event)
    try:
        await db.flush()
        counts.rows_written += 1
        counts.estimated_cost_usd += cost
    except IntegrityError:
        # Concurrent re-run hit the partial unique index — safe to skip.
        await db.rollback()
        counts.rows_skipped_existing += 1


async def backfill_org_usage(
    db: AsyncSession,
    *,
    org_id: str,
    dry_run: bool = False,
    backfill_run_id: str | None = None,
) -> BackfillCounts:
    """Synthesise estimated usage_events for every session in *org_id*.

    Idempotent — sessions whose backfill rows exist are skipped. Use
    `dry_run=True` to count what would be written without persisting."""
    from uuid import uuid4

    run_id = backfill_run_id or str(uuid4())
    counts = BackfillCounts()

    sessions = (await db.execute(select(Session).where(Session.org_id == org_id))).scalars().all()
    for session in sessions:
        counts.sessions_scanned += 1
        try:
            await _estimate_session(db, session, counts, dry_run=dry_run, backfill_run_id=run_id)
        except Exception:
            logger.exception("Backfill failed for session %s — continuing", session.id)

    if not dry_run:
        await db.commit()

    logger.info(
        "Backfill complete for org=%s: %s",
        org_id,
        counts.to_dict(),
    )
    return counts
