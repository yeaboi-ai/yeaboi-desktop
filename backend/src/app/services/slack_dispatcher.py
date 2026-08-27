"""Fan-out Slack events to team-subscribed channels.

All callers go through ``dispatch_event``; no code outside this module should
call ``_post_to_channel`` directly for team-routed events.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import Team
from ..models.team_slack_channel import TeamSlackChannel
from .connectors.slack_notifier import _load_slack_token, _post_to_channel
from .slack_templates import build_blocks_for_event, title_for_event

logger = logging.getLogger(__name__)


async def dispatch_event(
    db: AsyncSession,
    event_type: str,
    team_id: str,
    payload: dict,
) -> None:
    """Post a Slack message to every channel on ``team_id`` subscribed to ``event_type``.

    Never raises: missing integration, missing subscriptions, and per-channel
    failures are all logged and swallowed. Safe to call from anywhere — if
    Slack routing isn't set up, this is a no-op.
    """
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if team is None:
        logger.debug("dispatch_event: team %s not found", team_id)
        return

    token = await _load_slack_token(db, team.org_id)
    if token is None:
        logger.debug("dispatch_event: no active Slack integration for org %s", team.org_id)
        return

    rows_result = await db.execute(
        select(TeamSlackChannel).where(TeamSlackChannel.team_id == team_id)
    )
    rows = [r for r in rows_result.scalars().all() if event_type in (r.event_types or [])]
    if not rows:
        logger.debug("dispatch_event: no channels subscribed to %s on team %s", event_type, team_id)
        return

    text = title_for_event(event_type, payload)
    blocks = build_blocks_for_event(event_type, payload)

    for row in rows:
        try:
            await _post_to_channel(token, row.slack_channel_id, text, blocks)
        except Exception:
            logger.exception(
                "dispatch_event: per-channel post raised",
                extra={
                    "event_type": event_type,
                    "team_id": team_id,
                    "channel_id": row.slack_channel_id,
                },
            )
            continue
