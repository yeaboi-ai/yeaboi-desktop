"""Helpers for tracking + cleaning up Slack session-created announcements."""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.slack_session_announcement import SlackSessionAnnouncement
from .connectors.slack_notifier import _load_slack_token

logger = logging.getLogger(__name__)

_SLACK_API = "https://slack.com/api"
_TIMEOUT = 10.0


async def record_announcement(
    db: AsyncSession,
    *,
    session_id: str,
    org_id: str,
    channel_id: str,
    message_ts: str,
) -> None:
    """Persist where a session-created Block Kit was posted. Idempotent-ish —
    duplicates are harmless but avoided by the caller (we only call this once
    per successful post)."""
    if not message_ts:
        return
    db.add(
        SlackSessionAnnouncement(
            session_id=session_id,
            org_id=org_id,
            channel_id=channel_id,
            message_ts=message_ts,
        )
    )
    await db.commit()


async def delete_announcements_for_session(db: AsyncSession, session_id: str) -> None:
    """Delete the Slack messages that announced this session. Called just BEFORE
    the session row is removed — once the FK CASCADE fires we lose the pointers.

    Best-effort: Slack failures (deleted channel, revoked token, message too old)
    are swallowed. We still want the DB-side of the delete to succeed.
    """
    result = await db.execute(
        select(SlackSessionAnnouncement).where(
            SlackSessionAnnouncement.session_id == session_id
        )
    )
    announcements = list(result.scalars().all())
    if not announcements:
        return

    # Org should be consistent across all announcements for a single session,
    # but load per-row defensively.
    for ann in announcements:
        token = await _load_slack_token(db, ann.org_id)
        if not token:
            continue
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{_SLACK_API}/chat.delete",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    json={"channel": ann.channel_id, "ts": ann.message_ts},
                )
                if resp.status_code != 200 or not resp.json().get("ok"):
                    logger.debug(
                        "chat.delete non-ok for %s %s: %s",
                        ann.channel_id, ann.message_ts, resp.text[:200],
                    )
        except Exception:
            logger.debug(
                "chat.delete failed for %s %s", ann.channel_id, ann.message_ts, exc_info=True
            )
