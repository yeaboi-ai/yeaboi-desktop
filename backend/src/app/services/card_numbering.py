"""Per-project monotonic ticket numbering — produces friendly_id like "PROJ-123".

Uses an atomic UPDATE...RETURNING on Session.card_counter so concurrent inserts each
get a distinct number with no advisory locks. The row-level lock acquired by UPDATE
serializes counter bumps within a single project; concurrent inserts across different
projects don't contend.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.board import Card
from ..models.session import Session

logger = logging.getLogger(__name__)


_KEY_RE = re.compile(r"^[A-Z][A-Z0-9]{2,9}$")
_FALLBACK_KEY = "PROJ"


def _candidate_key(name: str) -> str:
    """Derive a 4-char uppercase key from a project name."""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    candidate = cleaned[:4]
    if len(candidate) >= 3 and candidate[0].isalpha():
        return candidate
    return _FALLBACK_KEY


async def derive_unique_key(name: str, org_id: str, db: AsyncSession) -> str:
    """Derive a project key unique within the org, appending an integer suffix on collisions."""
    base = _candidate_key(name)
    candidate = base
    suffix = 2
    while True:
        existing = await db.execute(
            select(Session.id).where(Session.org_id == org_id, Session.key == candidate)
        )
        if existing.scalar_one_or_none() is None:
            return candidate
        # Truncate base so suffix fits within String(10)
        max_base = 10 - len(str(suffix))
        candidate = f"{base[:max_base]}{suffix}"
        suffix += 1


def is_valid_key(key: str) -> bool:
    return bool(_KEY_RE.match(key))


async def assign_friendly_id(card: Card, session_id: str, db: AsyncSession) -> None:
    """Assign card.number and card.friendly_id atomically.

    Caller is responsible for committing the surrounding transaction. Mutates `card`
    in place and sets card.session_id (denormalized).

    If the project has no key yet (legacy/migration window), falls back to deriving
    one on the fly so we never produce a card without a friendly_id.
    """
    row = (
        await db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(card_counter=Session.card_counter + 1)
            .returning(Session.card_counter, Session.key, Session.name, Session.org_id)
        )
    ).one_or_none()

    if row is None:
        logger.warning("assign_friendly_id: project %s not found, skipping numbering", session_id)
        return

    counter, key, name, org_id = row
    if not key:
        key = await derive_unique_key(name, org_id, db)
        await db.execute(update(Session).where(Session.id == session_id).values(key=key))

    card.session_id = session_id
    card.number = counter
    card.friendly_id = f"{key}-{counter}"
