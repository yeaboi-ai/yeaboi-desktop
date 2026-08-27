"""Org-level granularity seeding, lookup, and CRUD support.

Mirrors :mod:`preset_service` / :mod:`ticket_template_service` exactly —
same async-lock seeding pattern, same ``is_system`` semantics, same
``deleted_at`` soft-delete. The 3 system granularities here are the same 3
that shipped hardcoded in :mod:`services.generation_styles`; lifting them
to org-editable rows is iteration 6's contribution.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.generation_granularity import GenerationGranularity
from .generation_styles import STYLE_FRAGMENTS

logger = logging.getLogger(__name__)

# Per-org seeding lock — same pattern as ticket_template_service.
_seed_locks: dict[str, asyncio.Lock] = {}


# ─── System granularities ───────────────────────────────────────────────────


SYSTEM_GENERATION_GRANULARITIES: list[dict] = [
    {
        "slug": "balanced",
        "label": "Balanced",
        "blurb": "8–20 tickets · 1–3 days each. The well-rounded default.",
        # Empty string is intentional — `balanced` is a no-op fragment so
        # users who don't pick anything get exactly today's behaviour.
        "prompt_fragment": STYLE_FRAGMENTS.get("balanced", ""),
    },
    {
        "slug": "minimal",
        "label": "Minimal",
        "blurb": "3–6 larger tickets, merged across concerns.",
        "prompt_fragment": STYLE_FRAGMENTS.get("minimal", ""),
    },
    {
        "slug": "many_small",
        "label": "Many small",
        "blurb": "20–40 tiny tickets, ≤1 day each. Easy to parallelise.",
        "prompt_fragment": STYLE_FRAGMENTS.get("many_small", ""),
    },
]


_SYSTEM_BY_SLUG: dict[str, dict] = {
    spec["slug"]: spec for spec in SYSTEM_GENERATION_GRANULARITIES
}


# ─── Seeding ────────────────────────────────────────────────────────────────


async def _seed_system_granularities(org_id: str, db: AsyncSession) -> None:
    for sort_order, spec in enumerate(SYSTEM_GENERATION_GRANULARITIES):
        row = GenerationGranularity(
            org_id=org_id,
            slug=spec["slug"],
            label=spec["label"],
            blurb=spec.get("blurb"),
            prompt_fragment=spec.get("prompt_fragment", ""),
            sort_order=sort_order,
            is_system=True,
        )
        db.add(row)
    await db.flush()
    logger.info(
        "Seeded %d granularities for org %s",
        len(SYSTEM_GENERATION_GRANULARITIES),
        org_id,
    )


async def ensure_org_granularities(org_id: str, db: AsyncSession) -> None:
    """Seed system granularities for an org if none exist.

    Multi-worker rescue: ``asyncio.Lock`` is per-process; another uvicorn
    worker can race past the existence check and both seed. The unique
    constraint catches the loser — we rollback and treat as already-seeded.
    """
    lock = _seed_locks.setdefault(org_id, asyncio.Lock())
    async with lock:
        result = await db.execute(
            select(GenerationGranularity.id)
            .where(
                GenerationGranularity.org_id == org_id,
                GenerationGranularity.deleted_at.is_(None),
            )
            .limit(1)
        )
        if result.scalar_one_or_none() is not None:
            return
        try:
            await _seed_system_granularities(org_id, db)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            logger.info(
                "Granularity seed lost a multi-worker race for org %s — already-seeded",
                org_id,
            )


# ─── Queries ────────────────────────────────────────────────────────────────


async def get_org_granularities(
    org_id: str, db: AsyncSession
) -> list[GenerationGranularity]:
    result = await db.execute(
        select(GenerationGranularity)
        .where(
            GenerationGranularity.org_id == org_id,
            GenerationGranularity.deleted_at.is_(None),
        )
        .order_by(GenerationGranularity.sort_order, GenerationGranularity.label)
    )
    return list(result.scalars().all())


async def get_granularity(row_id: str, db: AsyncSession) -> GenerationGranularity | None:
    return (
        await db.execute(
            select(GenerationGranularity).where(GenerationGranularity.id == row_id)
        )
    ).scalar_one_or_none()


def get_system_spec(slug: str) -> dict | None:
    """Return the built-in spec for a system granularity slug. Used by the
    reset endpoint to restore an admin-mutated system row."""
    return _SYSTEM_BY_SLUG.get(slug)
