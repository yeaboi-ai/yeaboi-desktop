"""Mention resolution: extract @handle tokens and map to user IDs.

``resolve_mentions(db, org_id, text)`` scans *text* for ``@handle`` tokens,
matches each handle case-insensitively against the local-part of ``User.email``
for members of *org_id*, and returns a deduplicated list of matched user IDs.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import OrgMember
from ..models.user import User

logger = logging.getLogger(__name__)

_MENTION_RE = re.compile(r"@([A-Za-z0-9._-]+)")


async def resolve_mentions(db: AsyncSession, org_id: str, text: str) -> list[str]:
    """Return a deduplicated list of user IDs whose email local-parts appear as @mentions in *text*.

    Only users who are members of *org_id* are considered.
    """
    handles = {m.lower() for m in _MENTION_RE.findall(text)}
    if not handles:
        return []

    # Load all org member user IDs
    members_result = await db.execute(
        select(OrgMember.user_id).where(OrgMember.org_id == org_id)
    )
    member_ids = [row[0] for row in members_result.all()]
    if not member_ids:
        return []

    # Load matching users
    users_result = await db.execute(
        select(User.id, User.email).where(User.id.in_(member_ids))
    )
    users = users_result.all()

    matched_ids: list[str] = []
    seen: set[str] = set()
    for user_id, email in users:
        local_part = email.split("@")[0].lower()
        if local_part in handles and user_id not in seen:
            matched_ids.append(user_id)
            seen.add(user_id)

    return matched_ids
