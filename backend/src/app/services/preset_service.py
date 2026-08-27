"""Org-level generation preset seeding, lookup, and CRUD support.

Mirrors :mod:`ticket_template_service` exactly — same async-lock seeding
pattern, same ``is_system`` semantics, same ``deleted_at`` soft-delete.
The 4 system presets here are the same 4 that shipped hardcoded in the
frontend during iteration 4; lifting them to an org-editable resource is
the whole point of iteration 5.

Reset support: :func:`reset_system_preset` overwrites a system preset's
mutable fields with the matching built-in spec. Slug + ``is_system`` stay
immutable so the wizard's preset-match logic doesn't drift if an admin
renames one and then resets it later.
"""

from __future__ import annotations

import asyncio
import logging
import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.generation_preset import GenerationPreset

logger = logging.getLogger(__name__)

# Per-org seeding lock — same pattern as ticket_template_service so concurrent
# first-load requests can't race past the existence check and double-seed.
_seed_locks: dict[str, asyncio.Lock] = {}


# ─── System presets ─────────────────────────────────────────────────────────


SYSTEM_GENERATION_PRESETS: list[dict] = [
    {
        "slug": "quick_prototype",
        "label": "Quick prototype",
        "blurb": "Solo dev wanting a deployable v0 fast.",
        "icon": "Flag",
        "granularity": "minimal",
        "modifiers": ["mvp_first", "vertical_slices"],
    },
    {
        "slug": "standard_sprint",
        "label": "Standard sprint",
        "blurb": "The safe default — well-rounded backlog with no special framing.",
        "icon": "Layers",
        "granularity": "balanced",
        "modifiers": [],
    },
    {
        "slug": "production_grade",
        "label": "Production-grade",
        "blurb": "Multi-person team shipping to real users. Tests + docs + observability + release.",
        "icon": "ShieldCheck",
        "granularity": "balanced",
        "modifiers": ["test_driven", "docs_bundled", "observability_first", "release_ready"],
    },
    {
        "slug": "stakeholder_demo",
        "label": "Stakeholder demo",
        "blurb": "Each wave produces a demoable, user-story-shaped artifact.",
        "icon": "MonitorPlay",
        "granularity": "balanced",
        "modifiers": ["vertical_slices", "demo_waves", "story_driven"],
    },
]


# Curated set of lucide icon names admins can pick. Keeps the editor a
# closed-list dropdown rather than a free-text footgun; the frontend has a
# matching ICON_BY_NAME map. Add entries here and in the frontend together.
ALLOWED_ICONS: tuple[str, ...] = (
    "Flag",
    "Layers",
    "ShieldCheck",
    "MonitorPlay",
    "Rocket",
    "Sparkles",
    "Compass",
    "GitBranch",
    "Grid3x3",
    "Layers3",
    "Minimize2",
    "User",
    "Waves",
    "Activity",
    "BookOpen",
    "FileCode2",
    "FlaskConical",
    "ListChecks",
    "Accessibility",
    "ShieldAlert",
)


_SYSTEM_BY_SLUG: dict[str, dict] = {spec["slug"]: spec for spec in SYSTEM_GENERATION_PRESETS}


# ─── Seeding ────────────────────────────────────────────────────────────────


async def _seed_system_presets(org_id: str, db: AsyncSession) -> None:
    """Insert the system generation presets for an org (idempotent under the lock)."""
    for sort_order, spec in enumerate(SYSTEM_GENERATION_PRESETS):
        preset = GenerationPreset(
            org_id=org_id,
            slug=spec["slug"],
            label=spec["label"],
            blurb=spec.get("blurb"),
            icon=spec.get("icon", "Layers"),
            granularity=spec.get("granularity", "balanced"),
            modifiers=list(spec.get("modifiers", [])),
            sort_order=sort_order,
            is_system=True,
        )
        db.add(preset)
    await db.flush()
    logger.info("Seeded %d generation presets for org %s", len(SYSTEM_GENERATION_PRESETS), org_id)


async def ensure_org_generation_presets(org_id: str, db: AsyncSession) -> None:
    """Seed the system generation presets for an org if none exist yet.

    The in-process ``asyncio.Lock`` only protects a single uvicorn worker;
    under multi-worker deployments two workers can pass the existence check
    concurrently and both attempt to INSERT. The unique constraint catches
    the second one — we rollback and treat it as already-seeded rather than
    surfacing a 500 to the user.
    """
    lock = _seed_locks.setdefault(org_id, asyncio.Lock())
    async with lock:
        result = await db.execute(
            select(GenerationPreset.id)
            .where(GenerationPreset.org_id == org_id, GenerationPreset.deleted_at.is_(None))
            .limit(1)
        )
        if result.scalar_one_or_none() is not None:
            return
        try:
            await _seed_system_presets(org_id, db)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            logger.info("Preset seed lost a multi-worker race for org %s — already-seeded", org_id)


# ─── Queries ────────────────────────────────────────────────────────────────


async def get_org_generation_presets(org_id: str, db: AsyncSession) -> list[GenerationPreset]:
    """List all non-deleted presets for an org, ordered by sort_order then label."""
    result = await db.execute(
        select(GenerationPreset)
        .where(GenerationPreset.org_id == org_id, GenerationPreset.deleted_at.is_(None))
        .order_by(GenerationPreset.sort_order, GenerationPreset.label)
    )
    return list(result.scalars().all())


async def get_preset(preset_id: str, db: AsyncSession) -> GenerationPreset | None:
    result = await db.execute(select(GenerationPreset).where(GenerationPreset.id == preset_id))
    return result.scalar_one_or_none()


# ─── Reset ──────────────────────────────────────────────────────────────────


def get_system_spec(slug: str) -> dict | None:
    """Return the built-in spec for a system preset slug, or None if unknown.

    Used by the reset endpoint to restore a system preset's mutable fields.
    """
    return _SYSTEM_BY_SLUG.get(slug)


# ─── Slug generation ────────────────────────────────────────────────────────


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(label: str, *, fallback: str = "preset") -> str:
    """Auto-generate a stable, URL-safe slug from a label. ``"Quick prototype"``
    → ``"quick_prototype"``. Caller is responsible for ensuring org-uniqueness.
    The ``fallback`` is returned when the input is empty/whitespace-only so we
    never insert an empty slug.
    """
    base = _SLUG_RE.sub("_", label.strip().lower()).strip("_")
    return base or fallback
