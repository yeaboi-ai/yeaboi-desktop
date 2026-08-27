"""W6.6.3 — Extract artifacts from a session transcript at completion time.

Produces a Granola-style recap payload with six keys:
  - summary (str): 2-3 sentence TL;DR.
  - highlights (list[{quote, speaker, ts}]): 3-5 key moments, verbatim quotes.
  - decisions (list[{text, ts}]): things explicitly chosen.
  - action_items (list[{text, ts}]): tasks somebody committed to.
  - open_questions (list[{text, ts}]): unresolved questions raised.
  - chapter_summaries (list[{label, start_ts, end_ts, summary}]): per-topic
    summaries, derived from "Switched to **X**" config-change markers (capped
    to 10). Empty when the session had no chapter switches.

The agent worker calls `extract_session_artifacts(session_id)` from its
session-complete hook. The result is stored on `Session.session_extraction`
and rendered on the recap screen.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.session import Session
from .ai_provider import get_ai_client

logger = logging.getLogger(__name__)


def empty_extraction() -> dict:
    """Fresh empty extraction payload with all six keys present.

    Used by:
      - the GET endpoint as the fallback when `session_extraction` is NULL
      - the service when no AI client / empty transcript / parse failure
      - tests asserting the canonical empty shape
    """
    return {
        "summary": "",
        "highlights": [],
        "decisions": [],
        "action_items": [],
        "open_questions": [],
        "chapter_summaries": [],
    }


# Kept for backward compatibility with imports elsewhere; do not mutate.
EMPTY = empty_extraction()

EXTRACT_SYSTEM_PROMPT = """You are extracting a Granola-style recap from a planning session transcript.

Return STRICT JSON with exactly these keys:

- summary: string. A 2-3 sentence TL;DR of the whole session. Plain prose,
  no bullets.
- highlights: array of {quote, speaker, ts}. 3-5 key moments. `quote` MUST
  be a verbatim line from the transcript (under 200 chars). `speaker` is the
  speaker name (string) or null. `ts` is the ISO 8601 timestamp of that line.
- decisions: array of {text, ts}. Things the team explicitly chose to do
  or not do.
- action_items: array of {text, ts}. Tasks somebody committed to (or that
  need a clear owner).
- open_questions: array of {text, ts}. Unresolved questions raised but not
  answered.
- chapter_summaries: array of {label, start_ts, end_ts, summary}. ONE entry
  per `[Chapter: X]` marker in the transcript, in order, capped at 10.
  `label` is the chapter name (the X). `start_ts` is the timestamp of the
  marker line. `end_ts` is the timestamp of the line just before the next
  marker (or the last line of the transcript for the final chapter).
  `summary` is a 1-2 sentence recap of what was discussed during that
  chapter. If there are no `[Chapter: X]` markers, return an empty array.

For decisions/action_items/open_questions:
  - text: a short, declarative sentence (under 100 characters where possible).
  - ts: the ISO 8601 timestamp of the transcript line that anchors this item.

Skip social filler, restatements, and meta-commentary. If a bucket has
nothing, return an empty array (or empty string for `summary`).

Respond with ONLY the JSON object — no prose, no code fences."""


async def extract_session_artifacts(session_id: str, db: AsyncSession) -> dict:
    """Extract recap artifacts and persist on the session.

    Returns the extraction dict (also written to Session.session_extraction).
    Falls back to the empty result if no AI provider is configured or the
    transcript is empty.
    """
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.chat_messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        logger.warning("extract_session_artifacts: session %s not found", session_id)
        return empty_extraction()

    # Keep regular turns + "Switched to" system markers (the latter become
    # `[Chapter: X]` anchors so the LLM can ground per-chapter summaries on
    # the same anchors the client uses to derive chapters from chat history).
    msgs = sorted(
        [
            m
            for m in session.chat_messages
            if m.content
            and (m.message_type != "system" or m.content.startswith("Switched to "))
        ],
        key=lambda m: m.created_at or 0,
    )
    # Drop empty / chapter-only transcripts — nothing to summarize.
    spoken = [m for m in msgs if m.message_type != "system"]
    if not spoken:
        session.session_extraction = empty_extraction()
        await db.commit()
        return empty_extraction()

    # Build a transcript with anchor timestamps + chapter markers.
    lines: list[str] = []
    for m in msgs:
        ts = m.created_at.isoformat() if m.created_at else ""
        if m.message_type == "system":
            # "Switched to **Senior Engineer**" -> "[Chapter: Senior Engineer]"
            label = m.content.replace("Switched to ", "", 1).replace("**", "").strip()
            lines.append(f"[{ts}] [Chapter: {label}]")
        else:
            speaker = m.speaker_name or "Unknown"
            lines.append(f"[{ts}] {speaker}: {m.content}")
    transcript = "\n".join(lines)

    client = await get_ai_client(session.org_id, db)
    if client is None:
        logger.info("No AI client for org %s — skipping extraction", session.org_id)
        session.session_extraction = empty_extraction()
        await db.commit()
        return empty_extraction()

    raw = await client.chat(
        system=EXTRACT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": transcript}],
        max_tokens=2500,
    )

    parsed: dict = empty_extraction()
    try:
        parsed = json.loads(raw.strip())
    except json.JSONDecodeError:
        logger.warning("Extraction returned non-JSON; trying to recover from fenced block")
        # Tolerate ```json ... ``` fences just in case the model ignores instructions.
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rstrip("`").strip()
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error("Extraction JSON parse failed: %s", e)
            parsed = empty_extraction()

    normalized = {
        "summary": _coerce_summary(parsed.get("summary")),
        "highlights": _coerce_highlights(parsed.get("highlights")),
        "decisions": _coerce_items(parsed.get("decisions")),
        "action_items": _coerce_items(parsed.get("action_items")),
        "open_questions": _coerce_items(parsed.get("open_questions")),
        "chapter_summaries": _coerce_chapter_summaries(parsed.get("chapter_summaries")),
    }
    session.session_extraction = normalized
    await db.commit()
    logger.info(
        "Extracted session %s: summary=%s, %d highlights, %d decisions, %d actions, %d questions, %d chapters",
        session_id,
        "yes" if normalized["summary"] else "no",
        len(normalized["highlights"]),
        len(normalized["decisions"]),
        len(normalized["action_items"]),
        len(normalized["open_questions"]),
        len(normalized["chapter_summaries"]),
    )
    return normalized


def _coerce_summary(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _coerce_items(value: object) -> list[dict]:
    """Return a list of {text, ts} dicts. Drop malformed entries silently."""
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for v in value:
        if not isinstance(v, dict):
            continue
        text = v.get("text")
        ts = v.get("ts")
        if not isinstance(text, str) or not text.strip():
            continue
        out.append({"text": text.strip(), "ts": ts if isinstance(ts, str) else None})
    return out


def _coerce_highlights(value: object) -> list[dict]:
    """Return a list of {quote, speaker, ts} dicts. Drop malformed entries."""
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for v in value:
        if not isinstance(v, dict):
            continue
        quote = v.get("quote")
        if not isinstance(quote, str) or not quote.strip():
            continue
        speaker = v.get("speaker")
        ts = v.get("ts")
        out.append({
            "quote": quote.strip(),
            "speaker": speaker if isinstance(speaker, str) else None,
            "ts": ts if isinstance(ts, str) else None,
        })
    return out


def _coerce_chapter_summaries(value: object) -> list[dict]:
    """Return a list of {label, start_ts, end_ts, summary} dicts (cap 10)."""
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for v in value:
        if not isinstance(v, dict):
            continue
        label = v.get("label")
        if not isinstance(label, str) or not label.strip():
            continue
        out.append({
            "label": label.strip(),
            "start_ts": v.get("start_ts") if isinstance(v.get("start_ts"), str) else None,
            "end_ts": v.get("end_ts") if isinstance(v.get("end_ts"), str) else None,
            "summary": (v.get("summary") or "").strip() if isinstance(v.get("summary"), str) else "",
        })
        if len(out) >= 10:
            break
    return out
