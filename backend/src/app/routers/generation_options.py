"""CRUD for org-level generation granularities + modifiers.

Identical shape on both resources — list / create / patch / reset (system
only) / soft-delete (custom only). Mirrors :mod:`routers.generation_presets`.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.generation_granularity import GenerationGranularity
from ..models.generation_modifier import GenerationModifier
from ..models.organization import Organization
from ..models.user import User
from ..schemas.generation_options import (
    GranularityCreate,
    GranularityResponse,
    GranularityUpdate,
    ModifierCreate,
    ModifierResponse,
    ModifierUpdate,
)
from ..services import granularity_service, modifier_service
from ..services.preset_service import slugify

logger = logging.getLogger(__name__)

router = APIRouter(tags=["planning-studio"])


# ─── granularity ────────────────────────────────────────────────────────────


@router.get("/api/generation-granularities", response_model=list[GranularityResponse])
async def list_granularities(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[GenerationGranularity]:
    await granularity_service.ensure_org_granularities(org.id, db)
    return await granularity_service.get_org_granularities(org.id, db)


@router.post("/api/generation-granularities", status_code=201, response_model=GranularityResponse)
async def create_granularity(
    body: GranularityCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationGranularity:
    await granularity_service.ensure_org_granularities(org.id, db)
    slug = body.slug or slugify(body.label, fallback="granularity")
    existing = await db.execute(
        select(GenerationGranularity).where(
            GenerationGranularity.org_id == org.id,
            GenerationGranularity.slug == slug,
            GenerationGranularity.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A granularity with slug {slug!r} already exists")
    row = GenerationGranularity(
        org_id=org.id,
        slug=slug,
        label=body.label.strip(),
        blurb=body.blurb,
        prompt_fragment=body.prompt_fragment,
        sort_order=body.sort_order,
        is_system=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/api/generation-granularities/{row_id}", response_model=GranularityResponse)
async def update_granularity(
    row_id: str,
    body: GranularityUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationGranularity:
    row = await granularity_service.get_granularity(row_id, db)
    if not row or row.org_id != org.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Granularity not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/api/generation-granularities/{row_id}/reset", response_model=GranularityResponse)
async def reset_granularity(
    row_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationGranularity:
    row = await granularity_service.get_granularity(row_id, db)
    if not row or row.org_id != org.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Granularity not found")
    if not row.is_system:
        raise HTTPException(status_code=400, detail="Only system granularities can be reset")
    spec = granularity_service.get_system_spec(row.slug)
    if spec is None:
        raise HTTPException(status_code=500, detail=f"No built-in spec for system slug {row.slug!r}")
    row.label = spec["label"]
    row.blurb = spec.get("blurb")
    row.prompt_fragment = spec.get("prompt_fragment", "")
    # sort_order intentionally NOT reset — preserve admin reordering.
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/api/generation-granularities/{row_id}", status_code=204)
async def delete_granularity(
    row_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await granularity_service.get_granularity(row_id, db)
    if not row or row.org_id != org.id:
        raise HTTPException(status_code=404, detail="Granularity not found")
    if row.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system granularities")
    if row.deleted_at is not None:
        return
    row.deleted_at = datetime.now(UTC)
    await db.commit()


# ─── modifier ───────────────────────────────────────────────────────────────


@router.get("/api/generation-modifiers", response_model=list[ModifierResponse])
async def list_modifiers(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[GenerationModifier]:
    await modifier_service.ensure_org_modifiers(org.id, db)
    return await modifier_service.get_org_modifiers(org.id, db)


@router.post("/api/generation-modifiers", status_code=201, response_model=ModifierResponse)
async def create_modifier(
    body: ModifierCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationModifier:
    await modifier_service.ensure_org_modifiers(org.id, db)
    slug = body.slug or slugify(body.label, fallback="modifier")
    existing = await db.execute(
        select(GenerationModifier).where(
            GenerationModifier.org_id == org.id,
            GenerationModifier.slug == slug,
            GenerationModifier.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A modifier with slug {slug!r} already exists")
    row = GenerationModifier(
        org_id=org.id,
        slug=slug,
        label=body.label.strip(),
        blurb=body.blurb,
        category=body.category,
        prompt_fragment=body.prompt_fragment,
        sort_order=body.sort_order,
        is_system=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/api/generation-modifiers/{row_id}", response_model=ModifierResponse)
async def update_modifier(
    row_id: str,
    body: ModifierUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationModifier:
    row = await modifier_service.get_modifier(row_id, db)
    if not row or row.org_id != org.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Modifier not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/api/generation-modifiers/{row_id}/reset", response_model=ModifierResponse)
async def reset_modifier(
    row_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> GenerationModifier:
    row = await modifier_service.get_modifier(row_id, db)
    if not row or row.org_id != org.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Modifier not found")
    if not row.is_system:
        raise HTTPException(status_code=400, detail="Only system modifiers can be reset")
    spec = modifier_service.get_system_spec(row.slug)
    if spec is None:
        raise HTTPException(status_code=500, detail=f"No built-in spec for system slug {row.slug!r}")
    row.label = spec["label"]
    row.blurb = spec.get("blurb")
    row.category = spec.get("category", "shape")
    row.prompt_fragment = spec.get("prompt_fragment", "")
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/api/generation-modifiers/{row_id}", status_code=204)
async def delete_modifier(
    row_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await modifier_service.get_modifier(row_id, db)
    if not row or row.org_id != org.id:
        raise HTTPException(status_code=404, detail="Modifier not found")
    if row.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system modifiers")
    if row.deleted_at is not None:
        return
    row.deleted_at = datetime.now(UTC)
    await db.commit()
