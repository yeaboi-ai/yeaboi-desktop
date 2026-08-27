"""CRUD for org-level generation presets surfaced in the Planning Studio.

Mirrors :mod:`routers.ticket_templates`. System presets can be edited but
not deleted; a dedicated reset endpoint restores them to the built-in spec
shipped in :data:`services.preset_service.SYSTEM_GENERATION_PRESETS`.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.generation_preset import GenerationPreset
from ..models.organization import Organization
from ..models.user import User
from ..schemas.generation_preset import PresetCreate, PresetResponse, PresetUpdate
from ..services.granularity_service import (
    ensure_org_granularities,
    get_org_granularities,
)
from ..services.modifier_service import ensure_org_modifiers, get_org_modifiers
from ..services.preset_service import (
    ALLOWED_ICONS,
    ensure_org_generation_presets,
    get_org_generation_presets,
    get_system_spec,
    slugify,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["planning-studio"])


async def _validate_preset_payload(
    org_id: str,
    db: AsyncSession,
    *,
    granularity: str | None,
    modifiers: list[str] | None,
    icon: str | None,
) -> None:
    """Validate slug / icon fields against the org's editable rows + the
    server's icon allow-list. Schemas don't enforce these because admin-
    created custom slugs are valid here but wouldn't be in a static enum."""
    if icon is not None and icon not in ALLOWED_ICONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown icon {icon!r}. Valid: {sorted(ALLOWED_ICONS)}",
        )
    if granularity is None and not modifiers:
        return
    # Ensure the org has the system rows seeded before lookup; otherwise a
    # POST issued before any GET would see an empty set and reject every slug.
    await ensure_org_granularities(org_id, db)
    await ensure_org_modifiers(org_id, db)
    if granularity is not None:
        rows = await get_org_granularities(org_id, db)
        if granularity not in {r.slug for r in rows}:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown granularity {granularity!r}. Valid: {sorted(r.slug for r in rows)}",
            )
    if modifiers:
        rows_m = await get_org_modifiers(org_id, db)
        org_slugs = {r.slug for r in rows_m}
        bad = [m for m in modifiers if m not in org_slugs]
        if bad:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown modifier(s) {bad}. Valid: {sorted(org_slugs)}",
            )


@router.get("/api/generation-presets", response_model=list[PresetResponse])
async def list_generation_presets(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[GenerationPreset]:
    """List the org's presets, seeding the 4 system presets on first access."""
    await ensure_org_generation_presets(org.id, db)
    return await get_org_generation_presets(org.id, db)


@router.post("/api/generation-presets", status_code=201, response_model=PresetResponse)
async def create_generation_preset(
    body: PresetCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationPreset:
    """Create a custom (non-system) preset. Slug auto-generated from label.

    Seeds the org's system presets first if they haven't been yet — otherwise
    an admin who hits POST before ever viewing the list would end up with one
    custom preset and no defaults, which is surprising.
    """
    await ensure_org_generation_presets(org.id, db)
    await _validate_preset_payload(org.id, db, granularity=body.granularity, modifiers=body.modifiers, icon=body.icon)
    slug = slugify(body.label)
    existing = await db.execute(
        select(GenerationPreset).where(
            GenerationPreset.org_id == org.id,
            GenerationPreset.slug == slug,
            GenerationPreset.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A preset named '{body.label}' already exists")

    preset = GenerationPreset(
        org_id=org.id,
        slug=slug,
        label=body.label.strip(),
        blurb=body.blurb,
        icon=body.icon,
        granularity=body.granularity,
        modifiers=list(body.modifiers),
        sort_order=body.sort_order,
        is_system=False,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


@router.patch("/api/generation-presets/{preset_id}", response_model=PresetResponse)
async def update_generation_preset(
    preset_id: str,
    body: PresetUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationPreset:
    """Update mutable fields. ``slug`` and ``is_system`` are immutable; system
    presets can have every other field edited freely."""
    result = await db.execute(
        select(GenerationPreset).where(
            GenerationPreset.id == preset_id,
            GenerationPreset.org_id == org.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset or preset.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Preset not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return preset

    await _validate_preset_payload(
        org.id,
        db,
        granularity=update_data.get("granularity"),
        modifiers=update_data.get("modifiers"),
        icon=update_data.get("icon"),
    )

    for field, value in update_data.items():
        setattr(preset, field, value)
    await db.commit()
    await db.refresh(preset)
    return preset


@router.post("/api/generation-presets/{preset_id}/reset", response_model=PresetResponse)
async def reset_generation_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationPreset:
    """Restore a system preset's mutable fields to the built-in spec. No-op
    for custom presets (returns 400 — they have no canonical default)."""
    result = await db.execute(
        select(GenerationPreset).where(
            GenerationPreset.id == preset_id,
            GenerationPreset.org_id == org.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset or preset.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Preset not found")
    if not preset.is_system:
        raise HTTPException(status_code=400, detail="Only system presets can be reset")

    spec = get_system_spec(preset.slug)
    if spec is None:
        # Should never happen — a system preset by definition has a spec — but
        # if seed data drifted, surface it as 500 rather than silently no-op.
        raise HTTPException(status_code=500, detail=f"No built-in spec for system slug {preset.slug!r}")

    preset.label = spec["label"]
    preset.blurb = spec.get("blurb")
    preset.icon = spec.get("icon", "Layers")
    preset.granularity = spec.get("granularity", "balanced")
    preset.modifiers = list(spec.get("modifiers", []))
    # sort_order intentionally NOT reset — admins may have reordered intentionally.
    await db.commit()
    await db.refresh(preset)
    return preset


@router.delete("/api/generation-presets/{preset_id}", status_code=204)
async def delete_generation_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a custom preset. System presets cannot be deleted — admins
    should reset them or hide them via sort_order instead."""
    result = await db.execute(
        select(GenerationPreset).where(
            GenerationPreset.id == preset_id,
            GenerationPreset.org_id == org.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    if preset.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system presets")
    if preset.deleted_at is not None:
        return  # already deleted — idempotent

    preset.deleted_at = datetime.now(UTC)
    await db.commit()
