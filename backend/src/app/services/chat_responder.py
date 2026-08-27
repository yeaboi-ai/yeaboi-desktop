"""Chat-side AI responder.

Independent from the LiveKit voice agent (`backend/agent/worker.py`). Fires
short, friendly text replies into the session chat when:

- a user posts a message whose stripped content is purely Unicode emoji, or
- a user toggles a reaction onto an existing message.

Throttled per session so a flurry of reactions doesn't spam the chat.
"""

from __future__ import annotations

import logging
import re
import time

from sqlalchemy import select

from ..db import get_session_factory
from ..models.session import ChatMessage, Session
from ..ws.manager import manager
from .ai_provider import get_ai_client_for_role

logger = logging.getLogger(__name__)

REACTION_THROTTLE_SECONDS = 30.0
_last_reply_at: dict[str, float] = {}


# Conservative emoji-only matcher: covers BMP emoji, supplementary planes
# used for emoji, ZWJ, variation selectors, skin-tone modifiers, and
# regional indicators. Matches a string that is *only* emoji + whitespace.
_EMOJI_ONLY_RE = re.compile(
    r"^[\s"
    r"\U0001F300-\U0001FAFF"  # symbols & pictographs, supplemental, extended-a
    r"\U0001F1E6-\U0001F1FF"  # regional indicators (flags)
    r"☀-➿"           # misc symbols + dingbats
    r"✀-➿"
    r"︀-️"           # variation selectors
    r"‍"                   # zero-width joiner
    r"⃣"                   # combining enclosing keycap
    r"]+$"
)


def is_emoji_only(content: str) -> bool:
    """Return True if `content` is non-empty and contains only emoji/whitespace."""
    if not content or not content.strip():
        return False
    return bool(_EMOJI_ONLY_RE.match(content))


def _throttled(session_id: str) -> bool:
    last = _last_reply_at.get(session_id, 0.0)
    return (time.monotonic() - last) < REACTION_THROTTLE_SECONDS


def _mark_reply(session_id: str) -> None:
    _last_reply_at[session_id] = time.monotonic()


async def _persist_and_broadcast(session_id: str, content: str, speaker_name: str) -> None:
    """Insert an AI chat message and broadcast it on the session WS room."""
    session_factory = get_session_factory()
    async with session_factory() as db:
        msg = ChatMessage(
            session_id=session_id,
            user_id=None,
            content=content,
            message_type="ai",
            speaker_name=speaker_name,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)

        await manager.broadcast(
            session_id,
            {
                "type": "chat_message",
                "payload": {
                    "id": msg.id,
                    "content": msg.content,
                    "message_type": msg.message_type,
                    "user_id": None,
                    "speaker_name": msg.speaker_name,
                    "created_at": msg.created_at.isoformat() if msg.created_at else "",
                },
            },
        )


async def _generate_reply(
    org_id: str | None,
    prompt: str,
    persona_label: str,
    *,
    session_id: str | None = None,
    project_id: str | None = None,
) -> str | None:
    """Call the chat AI for one short sentence. Returns None on failure."""
    session_factory = get_session_factory()
    try:
        async with session_factory() as db:
            client = await get_ai_client_for_role(
                org_id,
                db,
                role="chat",
                session_id=session_id,
                project_id=project_id,
            )
            text = await client.chat(
                system=(
                    f"You are the '{persona_label}' AI in a planning session chat. "
                    "Reply in ONE short sentence, no questions, no follow-ups. "
                    "Match the energy of the user's reaction. Do not introduce yourself, "
                    "do not say you're an AI, do not mention your role name."
                ),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=80,
                temperature=0.7,
            )
        return (text or "").strip()
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("chat_responder: AI call failed: %s", exc, exc_info=True)
        return None


async def _load_session_context(
    session_id: str,
) -> tuple[str | None, str | None, str, str | None]:
    """Return (org_id, last_message_excerpt, persona_label, project_id).

    persona_label falls back to "AI Facilitator" so the speaker name matches
    the existing facilitator path when no persona is set.
    """
    from .facilitator import PERSONA_LABELS

    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            return None, None, "AI Facilitator", None
        org_id = session.org_id
        project_id = session.project_id
        persona_key = (session.ai_config or {}).get("persona") or "default"
        persona_label = PERSONA_LABELS.get(persona_key, "AI Facilitator")
        # Last non-AI message gives the AI a tiny bit of grounding.
        msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id, ChatMessage.message_type != "ai")
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last = msg_result.scalar_one_or_none()
        excerpt = (last.content[:200] if last and last.content else None)
        return org_id, excerpt, persona_label, project_id


async def maybe_generate_reaction_reply(
    *,
    session_id: str,
    message_id: str,
    emoji: str,
    from_user_name: str,
) -> None:
    """Throttled chat-side ack of a reaction. Posts a short AI message."""
    try:
        if _throttled(session_id):
            logger.debug("chat_responder: throttled reaction reply for session %s", session_id)
            return
        _mark_reply(session_id)

        org_id, _, persona_label, project_id = await _load_session_context(session_id)
        target_excerpt = await _excerpt_for_message(session_id, message_id)
        prompt = (
            f'{from_user_name} reacted with {emoji} to: "{target_excerpt or ""}". '
            f"Acknowledge their {emoji} reaction warmly in one short sentence."
        )
        reply = await _generate_reply(
            org_id, prompt, persona_label, session_id=session_id, project_id=project_id
        )
        if reply:
            await _persist_and_broadcast(session_id, reply, persona_label)
    except Exception as exc:  # noqa: BLE001
        logger.warning("chat_responder: reaction reply failed: %s", exc, exc_info=True)


async def maybe_generate_emoji_message_reply(
    *,
    session_id: str,
    emoji_content: str,
    from_user_name: str,
) -> None:
    """Throttled chat-side ack of an emoji-only message."""
    try:
        if _throttled(session_id):
            logger.debug("chat_responder: throttled emoji-message reply for session %s", session_id)
            return
        _mark_reply(session_id)

        org_id, last_excerpt, persona_label, project_id = await _load_session_context(session_id)
        prompt = (
            f"{from_user_name} just sent {emoji_content} in chat"
            + (f' (after we were discussing: "{last_excerpt}")' if last_excerpt else "")
            + ". Acknowledge their emoji warmly in one short sentence."
        )
        reply = await _generate_reply(
            org_id, prompt, persona_label, session_id=session_id, project_id=project_id
        )
        if reply:
            await _persist_and_broadcast(session_id, reply, persona_label)
    except Exception as exc:  # noqa: BLE001
        logger.warning("chat_responder: emoji-message reply failed: %s", exc, exc_info=True)


async def _excerpt_for_message(session_id: str, message_id: str) -> str | None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
        msg = result.scalar_one_or_none()
        if not msg or msg.session_id != session_id:
            return None
        return (msg.content or "")[:200]
