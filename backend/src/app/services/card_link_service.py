"""CardLink service — typed relationships between cards (blocks/relates_to/...).

Storage is canonical-direction: the row's ``link_type`` describes the
source→target relationship. Inverses ("blocked by", "child of") are computed
at read time. ``relates_to`` is symmetric — the row direction doesn't matter
for rendering but the unique constraint still uses (source, target, type) so
duplicates are caught regardless of which side initiated.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.card_link import CardLink

logger = logging.getLogger(__name__)


# User-facing link types accepted on POST. ``blocked_by``/``child_of``/``duplicate_of``
# are inverse aliases — the service normalizes them by swapping source/target so
# the canonical row uses the forward type.
ACCEPTED_TYPES = {
    "blocks",
    "blocked_by",
    "relates_to",
    "duplicates",
    "duplicate_of",
    "parent_of",
    "child_of",
}

_INVERSE_TO_FORWARD = {
    "blocked_by": ("blocks", True),     # swap source/target
    "duplicate_of": ("duplicates", True),
    "child_of": ("parent_of", True),
}


def normalize_link(
    source_card_id: str, target_card_id: str, link_type: str
) -> tuple[str, str, str]:
    """Convert any user-facing link type into a canonical (source, target, type) triple."""
    if link_type not in ACCEPTED_TYPES:
        raise ValueError(f"Unsupported link type: {link_type}")

    if link_type in _INVERSE_TO_FORWARD:
        canonical, swap = _INVERSE_TO_FORWARD[link_type]
        if swap:
            return target_card_id, source_card_id, canonical
        return source_card_id, target_card_id, canonical
    return source_card_id, target_card_id, link_type


async def would_create_cycle(
    source_card_id: str, target_card_id: str, db: AsyncSession
) -> bool:
    """DFS forward through 'blocks' edges from ``target``. If we reach ``source``,
    inserting (source → target, blocks) would close a cycle.

    Only applied to ``blocks``-style links. ``relates_to`` is symmetric / non-
    directional, ``duplicates`` is acyclic by definition, and ``parent_of`` uses
    a separate one-parent invariant (enforced at the DB column layer via
    Card.parent_card_id).
    """
    if source_card_id == target_card_id:
        return True

    seen: set[str] = set()
    stack: list[str] = [target_card_id]
    while stack:
        cur = stack.pop()
        if cur == source_card_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        rows = (
            await db.execute(
                select(CardLink.target_card_id).where(
                    CardLink.source_card_id == cur,
                    CardLink.link_type == "blocks",
                )
            )
        ).scalars().all()
        stack.extend(rows)
    return False


async def is_blocked(card_id: str, db: AsyncSession) -> bool:
    """True iff any inbound 'blocks' link exists from a card not in a Done column."""
    from ..models.board import BoardColumn, Card

    rows = (
        await db.execute(
            select(Card.id, BoardColumn.name)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(CardLink, CardLink.source_card_id == Card.id)
            .where(CardLink.target_card_id == card_id, CardLink.link_type == "blocks")
        )
    ).all()
    for _src_id, col_name in rows:
        # "Done" is the conventional terminal column name; if none of the
        # blockers are there, the card is still blocked.
        if (col_name or "").strip().lower() != "done":
            return True
    return False


async def get_links_for_card(
    card_id: str, db: AsyncSession
) -> list[tuple[CardLink, str]]:
    """Return (link, direction) tuples — one row per link, direction is "outbound" or "inbound"."""
    out_rows = (
        await db.execute(select(CardLink).where(CardLink.source_card_id == card_id))
    ).scalars().all()
    in_rows = (
        await db.execute(select(CardLink).where(CardLink.target_card_id == card_id))
    ).scalars().all()
    return [(ln, "outbound") for ln in out_rows] + [(ln, "inbound") for ln in in_rows]
