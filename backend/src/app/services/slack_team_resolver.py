"""Resolve a Slack channel to a platform team.

``resolve_team_from_channel`` performs a first-match lookup in
``TeamSlackChannel`` ordered by the row ``id`` (insertion order),
making it deterministic when the same channel is mapped to multiple teams.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.team_slack_channel import TeamSlackChannel

logger = logging.getLogger(__name__)


async def resolve_team_from_channel(db: AsyncSession, slack_channel_id: str) -> str | None:
    """Return the ``team_id`` of the first ``TeamSlackChannel`` row for *slack_channel_id*.

    Returns None when no mapping exists.  When the channel is mapped to
    multiple teams the row with the lowest ``id`` (lexicographic / insertion
    order) wins.
    """
    result = await db.execute(
        select(TeamSlackChannel)
        .where(TeamSlackChannel.slack_channel_id == slack_channel_id)
        .order_by(TeamSlackChannel.id)
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        logger.debug("resolve_team_from_channel: no team mapped to channel %s", slack_channel_id)
        return None
    return row.team_id
