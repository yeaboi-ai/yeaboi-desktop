"""Passive blueprint extraction for the AI Listening (transcription-only) path.

When the user is on a call without an explicitly dispatched LiveKit voice
agent, the frontend's Deepgram hook still streams transcripts to
``POST /api/internal/messages`` as ``voice_chat`` records. The LiveKit agent
worker is the only place that previously ran blueprint extraction, so those
messages produced no suggestions until the user invited the agent.

This service plugs that gap: each new ``voice_chat`` message schedules a
debounced extraction pass that reads the unprocessed slice for the session,
runs the same Claude Haiku extraction prompt the agent worker uses, and
queues bullets as pending ``BlueprintSuggestion`` rows via the existing
service layer (so the WS broadcast and frontend hooks light up exactly like
they do for the agent path).

Concurrency: per-session ``asyncio.Lock`` prevents two extraction passes
running over the same buffer slice. Per-session debounce timer coalesces
bursts of incoming transcripts so we don't fire one Claude call per word.
"""

from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.session import ChatMessage, Session
from ..schemas.blueprint import BLUEPRINT_SECTIONS
from .ai_provider import get_ai_client_for_role
from .provider_errors import ProviderError

logger = logging.getLogger(__name__)


# Section labels mirror the agent worker's BLUEPRINT_FLOW so the LLM sees the
# same context layout regardless of which extraction path it's running on.
_SECTION_LABELS: dict[str, str] = {
    "project_overview": "Project Overview",
    "goals_constraints": "Goals & Constraints",
    "users_personas": "Users & Personas",
    "team_capacity": "Team & Capacity",
    "architecture": "Architecture",
    "tech_stack": "Tech Stack",
    "api_integrations": "API & Integrations",
    "ui_ux": "UI/UX",
    "security_compliance": "Security & Compliance",
    "infrastructure": "Infrastructure",
    "risks_unknowns": "Risks & Unknowns",
    "out_of_scope": "Out of Scope",
    "open_questions": "Open Questions",
}


_EXTRACT_PROMPT = """You extract project-blueprint facts from a meeting transcript. Your output is grounded ONLY in what was literally said. You are NOT a consultant, advisor, or risk analyst — do not infer, suggest, or volunteer information that is not explicitly stated.

CONVERSATION:
{conversation}

ALREADY IN THE BLUEPRINT (do NOT re-emit any of these — the backend keeps them automatically):
{blueprint_state}

For each section where the conversation contains NEW information that isn't already in the blueprint, output a JSON object with ONLY the new bullets — one new fact per "- " line. The backend will union your bullets with the existing content; you do NOT need to repeat anything that's already there.

CONFLICT DETECTION: If a new fact CONTRADICTS or UPDATES a specific existing bullet in the same section (e.g., "team of 5 engineers" → "team of 3 engineers"), include a `supersedes` field in the JSON object containing the EXACT verbatim text of the existing bullet (including its leading "- " marker if present). The user will see the conflict and choose to replace or keep both. If the new fact merely adds information without conflicting with anything existing, omit `supersedes`.

If the conversation contains nothing new (or nothing that maps to a blueprint section), output an empty array `[]`. An empty array is ALWAYS the correct answer if you are unsure.

HARD RULES (these override everything else):
1. NEVER invent, infer, or extrapolate. If a bullet's content cannot be quoted or directly paraphrased from the conversation lines above, DO NOT emit it. When in doubt, skip it.
2. Do NOT emit "best practice" advice, security risks, mitigations, common patterns, or industry warnings unless the speaker said them in the conversation.
3. Do NOT generate Security & Compliance, Risks & Unknowns, Open Questions, or other sections from your general knowledge — only from explicit speaker statements.
4. Format each fact as a "- " bullet on its own line. Example: "- Solo developer\\n- No fixed sprint length"
5. NEVER use prefixes like "RESOLVED:", "CONFIRMED:", "DECIDED:" — state the fact directly.
6. Keep each bullet concise — one clear statement per line, ideally <100 chars.
7. If the conversation only restates something already in the blueprint, output an empty array.
8. Self-check before outputting: for each bullet, point to the exact phrase in the conversation that supports it. If you cannot, drop it.
9. `supersedes` is OPTIONAL and only applies when the new fact directly contradicts ONE specific existing bullet. Do NOT use it for unrelated additions.

Output format — ONLY valid JSON, no markdown. `supersedes` is optional:
[
  {{"section": "tech_stack", "content": "- Redis cache"}},
  {{"section": "team_capacity", "content": "- Team of 3 engineers", "supersedes": "- Team of 5 engineers"}}
]

Valid sections: {sections}"""  # noqa: E501


# Per-session locks + debounce tasks live in module state so the trigger can
# be called from any request handler without extra plumbing. Process-local;
# fine for a single-worker dev setup. In a multi-worker deploy this would
# need a cross-process coordinator (Redis lock) — out of scope for v1.
_session_locks: dict[str, asyncio.Lock] = {}
_pending_tasks: dict[str, asyncio.Task] = {}

# How long to wait for the burst to settle before extracting. Tuned to
# coalesce a paragraph's worth of fragmented Deepgram finals into one
# extraction call instead of one per sentence.
DEBOUNCE_SECONDS = 6.0


def _get_lock(session_id: str) -> asyncio.Lock:
    lock = _session_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_locks[session_id] = lock
    return lock


def schedule_extraction(session_id: str, session_factory) -> None:
    """Debounce + schedule a passive extraction pass for the session.

    Cancels any pending extraction so a burst of transcripts only triggers
    one Claude call after the burst settles. ``session_factory`` is the
    async sessionmaker — we accept it as a parameter so the caller (a
    request handler) can hand its own session factory in without import
    cycles.
    """
    existing = _pending_tasks.get(session_id)
    if existing and not existing.done():
        existing.cancel()

    async def _runner() -> None:
        try:
            await asyncio.sleep(DEBOUNCE_SECONDS)
        except asyncio.CancelledError:
            return
        try:
            async with session_factory() as db:
                await run_extraction_pass(session_id, db)
        except Exception:
            logger.warning("Passive extraction pass failed for %s", session_id, exc_info=True)
        finally:
            # Self-cleanup so the dict doesn't grow forever
            cur = _pending_tasks.get(session_id)
            if cur is not None and cur.done():
                _pending_tasks.pop(session_id, None)

    _pending_tasks[session_id] = asyncio.create_task(_runner())


async def run_extraction_pass(session_id: str, db: AsyncSession) -> None:
    """Run one extraction pass over the unprocessed voice_chat slice.

    Watermark is stored on ``Session.agent_runtime_state`` under the key
    ``passive_extraction_last_message_id``. New messages = those whose
    ``created_at`` strictly exceeds the watermark message's ``created_at``.
    """
    settings = get_settings()
    if not (settings.anthropic_api_key or settings.google_api_key or settings.openai_api_key):
        # No primary or backup LLM key configured — extraction can't run.
        logger.debug("No AI provider key configured — skipping passive extraction")
        return

    lock = _get_lock(session_id)
    if lock.locked():
        logger.debug("Passive extraction already running for %s", session_id)
        return

    async with lock:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if session is None:
            return

        runtime_state = dict(session.agent_runtime_state or {})
        last_id = runtime_state.get("passive_extraction_last_message_id")

        # Pull voice transcripts (and AI responses, if any) in chronological
        # order. We bound by the last-extracted message_id; if none yet,
        # use the whole session — first pass.
        cutoff_at = None
        if last_id:
            cutoff_q = await db.execute(select(ChatMessage.created_at).where(ChatMessage.id == last_id))
            cutoff_at = cutoff_q.scalar_one_or_none()

        # Voice-only: AI Suggestions must reflect what was *spoken* on the
        # call. Typed chat messages have their own facilitator path that
        # updates the blueprint directly via `_run_facilitator()` (see
        # `backend/src/app/routers/sessions.py`); pulling them in here would
        # double-emit them as pending suggestions.
        msg_q = select(ChatMessage).where(
            ChatMessage.session_id == session_id,
            ChatMessage.message_type.in_(("voice_chat", "voice_ai")),
        )
        if cutoff_at is not None:
            msg_q = msg_q.where(ChatMessage.created_at > cutoff_at)
        msg_q = msg_q.order_by(ChatMessage.created_at.asc())

        msg_result = await db.execute(msg_q)
        new_messages = list(msg_result.scalars().all())
        if not new_messages:
            return

        # Pull current blueprint so the prompt can dedupe against existing
        # bullets — same input shape the agent uses.
        from .blueprint_service import get_or_create_blueprint

        bp = await get_or_create_blueprint(session.project_id, db)
        current_blueprint = dict(bp.content or {})

        # Build prompt
        conv_lines: list[str] = []
        source_ids: list[str] = []
        for m in new_messages[-30:]:
            speaker = m.speaker_name or ("AI" if m.message_type in ("ai", "voice_ai") else "User")
            conv_lines.append(f"{speaker}: {m.content}")
            source_ids.append(m.id)

        bp_lines = [
            f"{label}: {(current_blueprint.get(key, '') or '').strip() or 'EMPTY'}"
            for key, label in _SECTION_LABELS.items()
        ]
        prompt = _EXTRACT_PROMPT.format(
            conversation="\n".join(conv_lines),
            blueprint_state="\n".join(bp_lines),
            sections=", ".join(BLUEPRINT_SECTIONS),
        )

        try:
            client = await get_ai_client_for_role(org_id=None, db=None, role="passive_extract")
            raw = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2048,
                # Temperature 0: extraction must be deterministic and grounded.
                # Any creativity here turns into hallucinated security risks /
                # mitigation advice / "industry best practice" content the
                # speaker never mentioned.
                temperature=0,
            )
        except ProviderError as exc:
            logger.warning("Passive extraction unavailable (%s) for %s", exc.code, session_id)
            return
        except Exception as exc:
            logger.warning("Passive extraction LLM call failed for %s: %s", session_id, exc)
            return

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            updates = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Passive extraction returned non-JSON for %s: %s", session_id, raw[:200])
            updates = []

        if not isinstance(updates, list):
            updates = []

        from ..ws.manager import manager
        from .blueprint_service import create_suggestion

        applied = 0
        for item in updates:
            if not isinstance(item, dict):
                continue
            section = (item.get("section") or "").strip()
            content = (item.get("content") or "").strip()
            if not section or section not in BLUEPRINT_SECTIONS or not content:
                continue
            raw_supersedes = item.get("supersedes")
            supersedes_bullet = (
                raw_supersedes.strip() if isinstance(raw_supersedes, str) and raw_supersedes.strip() else None
            )
            suggestion = await create_suggestion(
                session.project_id,
                section,
                content,
                db,
                source_message_ids=source_ids or None,
                supersedes_bullet=supersedes_bullet,
            )
            applied += 1
            await manager.broadcast(
                session_id,
                {
                    "type": "suggestion_added",
                    "payload": {
                        "id": suggestion.id,
                        "project_id": suggestion.project_id,
                        "session_id": suggestion.session_id,
                        "section": suggestion.section,
                        "content": suggestion.content,
                        "status": suggestion.status,
                        "supersedes_bullet": suggestion.supersedes_bullet,
                        "created_at": suggestion.created_at.isoformat() if suggestion.created_at else "",
                    },
                },
            )

        # Advance watermark to the newest processed message regardless of
        # whether anything was extracted — otherwise a chunk that yielded
        # zero bullets would be re-processed on the next message.
        runtime_state["passive_extraction_last_message_id"] = new_messages[-1].id
        session.agent_runtime_state = runtime_state
        await db.commit()

        if applied:
            logger.info("Passive extraction queued %s suggestions for session %s", applied, session_id)
