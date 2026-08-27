"""Org-level modifier seeding, lookup, and CRUD support.

Same shape as :mod:`granularity_service`, plus a ``category`` field per row
slotting the modifier into one of the 4 hardcoded category buckets
(shape / quality / risk / methodology). The 16 system modifiers are seeded
from :data:`services.generation_styles.STYLE_FRAGMENTS`.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.generation_modifier import GenerationModifier
from .generation_styles import STYLE_FRAGMENTS

logger = logging.getLogger(__name__)

# Categories aren't user-editable in this iteration — keeping the set
# fixed avoids a third level of customisation in the editor.
MODIFIER_CATEGORIES: tuple[str, ...] = ("shape", "quality", "risk", "methodology")


_seed_locks: dict[str, asyncio.Lock] = {}


# ─── System modifiers ───────────────────────────────────────────────────────
# Order within each category preserves the menu admins see by default.

SYSTEM_GENERATION_MODIFIERS: list[dict] = [
    # ── shape ──
    {
        "slug": "vertical_slices",
        "category": "shape",
        "label": "Vertical slices",
        "blurb": "Each ticket delivers end-to-end value (UI + API + DB together).",
    },
    {
        "slug": "story_driven",
        "category": "shape",
        "label": "User stories",
        "blurb": '"As a … I want … so that …" titles; AC as observable outcomes.',
    },
    {
        "slug": "spike_first",
        "category": "shape",
        "label": "Spike-first",
        "blurb": "Investigation tickets before unknowns and ambiguity.",
    },
    {
        "slug": "wave_optimised",
        "category": "shape",
        "label": "Wave-optimised",
        "blurb": "Maximise wave-0 parallelism for the autonomous orchestrator.",
    },
    {
        "slug": "follow_practices",
        "category": "shape",
        "label": "Follow your practices",
        "blurb": "Mirror the linked GitHub repo's conventions.",
    },
    # ── quality ──
    {
        "slug": "test_driven",
        "category": "quality",
        "label": "Test-driven",
        "blurb": "Tests required; paired test tickets for non-trivial features.",
    },
    {
        "slug": "docs_bundled",
        "category": "quality",
        "label": "Docs bundled",
        "blurb": "Docs updates land with every user-facing change.",
    },
    {
        "slug": "observability_first",
        "category": "quality",
        "label": "Observability-first",
        "blurb": "Logging / metrics / tracing AC on every ticket.",
    },
    {
        "slug": "release_ready",
        "category": "quality",
        "label": "Release-ready",
        "blurb": "Final wave covers deploy + flag + monitoring + rollback.",
    },
    # ── risk ──
    {
        "slug": "risk_mitigated",
        "category": "risk",
        "label": "Risk-mitigated",
        "blurb": "Concrete mitigation tickets for every KNOWN risk.",
    },
    {
        "slug": "compliance_aware",
        "category": "risk",
        "label": "Compliance-aware",
        "blurb": "Audit, encryption, access-control tickets when relevant.",
    },
    {
        "slug": "accessibility",
        "category": "risk",
        "label": "Accessibility",
        "blurb": "a11y AC on UI tickets; audit per UI surface.",
    },
    # ── methodology ──
    {
        "slug": "mvp_first",
        "category": "methodology",
        "label": "MVP-first",
        "blurb": "Re-order so waves 0–1 ship a deployable v0.",
    },
    {
        "slug": "gherkin_ac",
        "category": "methodology",
        "label": "Gherkin AC",
        "blurb": "Acceptance criteria framed as Given / When / Then.",
    },
    {
        "slug": "api_contract_first",
        "category": "methodology",
        "label": "API-contract-first",
        "blurb": "Schema tickets BEFORE any implementation that consumes them.",
    },
    {
        "slug": "demo_waves",
        "category": "methodology",
        "label": "Demo-able waves",
        "blurb": "Each wave produces a stakeholder-demoable artifact.",
    },
]


_SYSTEM_BY_SLUG: dict[str, dict] = {
    spec["slug"]: spec for spec in SYSTEM_GENERATION_MODIFIERS
}


# ─── Seeding ────────────────────────────────────────────────────────────────


async def _seed_system_modifiers(org_id: str, db: AsyncSession) -> None:
    for sort_order, spec in enumerate(SYSTEM_GENERATION_MODIFIERS):
        row = GenerationModifier(
            org_id=org_id,
            slug=spec["slug"],
            label=spec["label"],
            blurb=spec.get("blurb"),
            category=spec["category"],
            prompt_fragment=STYLE_FRAGMENTS.get(spec["slug"], ""),
            sort_order=sort_order,
            is_system=True,
        )
        db.add(row)
    await db.flush()
    logger.info(
        "Seeded %d modifiers for org %s",
        len(SYSTEM_GENERATION_MODIFIERS),
        org_id,
    )


async def ensure_org_modifiers(org_id: str, db: AsyncSession) -> None:
    """Seed system modifiers for an org if none exist.

    Multi-worker rescue: ``asyncio.Lock`` is per-process; another uvicorn
    worker can race past the existence check and both seed. The unique
    constraint catches the loser — we rollback and treat as already-seeded.
    """
    lock = _seed_locks.setdefault(org_id, asyncio.Lock())
    async with lock:
        result = await db.execute(
            select(GenerationModifier.id)
            .where(
                GenerationModifier.org_id == org_id,
                GenerationModifier.deleted_at.is_(None),
            )
            .limit(1)
        )
        if result.scalar_one_or_none() is not None:
            return
        try:
            await _seed_system_modifiers(org_id, db)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            logger.info(
                "Modifier seed lost a multi-worker race for org %s — already-seeded",
                org_id,
            )


# ─── Queries ────────────────────────────────────────────────────────────────


async def get_org_modifiers(org_id: str, db: AsyncSession) -> list[GenerationModifier]:
    result = await db.execute(
        select(GenerationModifier)
        .where(
            GenerationModifier.org_id == org_id,
            GenerationModifier.deleted_at.is_(None),
        )
        .order_by(GenerationModifier.sort_order, GenerationModifier.label)
    )
    return list(result.scalars().all())


async def get_modifier(row_id: str, db: AsyncSession) -> GenerationModifier | None:
    return (
        await db.execute(
            select(GenerationModifier).where(GenerationModifier.id == row_id)
        )
    ).scalar_one_or_none()


def get_system_spec(slug: str) -> dict | None:
    """Return the built-in spec for a system modifier slug. Includes the
    `prompt_fragment` from STYLE_FRAGMENTS so reset restores the original
    prompt text too — not just the label/category."""
    spec = _SYSTEM_BY_SLUG.get(slug)
    if spec is None:
        return None
    return {**spec, "prompt_fragment": STYLE_FRAGMENTS.get(slug, "")}
