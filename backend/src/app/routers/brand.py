"""Org branding endpoints — saved brand presets, AI generator, logo upload.

Multiple brands can be saved per org. Exactly one is_active at a time;
activating one deactivates the others and updates ``org_themes`` to point
at that brand's theme. Apply (the AI flow) always creates a new saved row.
"""

from __future__ import annotations

import logging
import os
import uuid
from copy import deepcopy
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_org_admin, require_org_member
from ..middleware.rate_limit import limiter
from ..models.brand import OrgBrand
from ..models.theme import OrgTheme, ThemePreset
from ..models.user import User
from ..schemas.brand import (
    BrandApplyRequest,
    BrandApplyResponse,
    BrandDuplicateRequest,
    BrandGenerateRequest,
    BrandResponse,
    BrandSuggestion,
    BrandUpdate,
)
from ..services import brand_generator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["brand"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "image/gif",
}
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


# ---------------------------------------------------------------------------
# Response shaping
# ---------------------------------------------------------------------------


def _to_response(brand: OrgBrand | None, org_id: str) -> BrandResponse:
    if brand is None:
        return BrandResponse(org_id=org_id)
    return BrandResponse(
        id=brand.id,
        org_id=brand.org_id,
        name=brand.name,
        is_active=brand.is_active,
        app_name=brand.app_name,
        tagline=brand.tagline,
        logo_url=brand.logo_url,
        favicon_url=brand.favicon_url,
        source_url=brand.source_url,
        theme_id=brand.theme_id,
    )


# ---------------------------------------------------------------------------
# GET active brand (back-compat) + GET list
# ---------------------------------------------------------------------------


@router.get("/api/orgs/{org_id}/brand", response_model=BrandResponse)
@limiter.limit("60/minute")
async def get_active_brand(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    """Return the currently-active brand for the org (or empty)."""
    await require_org_member(org_id, user, db)
    result = await db.execute(
        select(OrgBrand).where(OrgBrand.org_id == org_id, OrgBrand.is_active.is_(True))
    )
    return _to_response(result.scalar_one_or_none(), org_id)


@router.get("/api/orgs/{org_id}/brands", response_model=list[BrandResponse])
@limiter.limit("60/minute")
async def list_brands(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BrandResponse]:
    """List all saved brands for the org. Active first, then most-recently updated."""
    await require_org_member(org_id, user, db)
    result = await db.execute(
        select(OrgBrand)
        .where(OrgBrand.org_id == org_id)
        .order_by(OrgBrand.is_active.desc(), OrgBrand.updated_at.desc())
    )
    return [_to_response(b, org_id) for b in result.scalars().all()]


# ---------------------------------------------------------------------------
# Update / delete by id
# ---------------------------------------------------------------------------


async def _load_brand_for_admin(
    db: AsyncSession,
    org_id: str,
    brand_id: str,
    user: User,
) -> OrgBrand:
    await require_org_admin(org_id, user, db)
    result = await db.execute(
        select(OrgBrand).where(OrgBrand.id == brand_id, OrgBrand.org_id == org_id)
    )
    brand = result.scalar_one_or_none()
    if brand is None:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@router.put("/api/orgs/{org_id}/brands/{brand_id}", response_model=BrandResponse)
@limiter.limit("30/minute")
async def update_brand(
    request: Request,
    org_id: str,
    brand_id: str,
    body: BrandUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    brand = await _load_brand_for_admin(db, org_id, brand_id, user)
    if body.name is not None:
        brand.name = body.name
    if body.app_name is not None:
        brand.app_name = body.app_name
    if body.tagline is not None:
        brand.tagline = body.tagline
    if body.logo_url is not None:
        brand.logo_url = body.logo_url
    if body.favicon_url is not None:
        brand.favicon_url = body.favicon_url
    if body.source_url is not None:
        brand.source_url = body.source_url
    if body.theme_id is not None:
        brand.theme_id = body.theme_id
    await db.commit()
    await db.refresh(brand)
    # Active brand updated → other tabs refresh wordmark/logo.
    if brand.is_active:
        logger.info("brand_updated_active org=%s brand=%s by=%s", org_id, brand.id, user.id)
    return _to_response(brand, org_id)


@router.delete("/api/orgs/{org_id}/brands/{brand_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_brand(
    request: Request,
    org_id: str,
    brand_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    brand = await _load_brand_for_admin(db, org_id, brand_id, user)
    if brand.is_active:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the active brand. Activate another brand first.",
        )
    await db.delete(brand)
    await db.commit()
    logger.info("brand_deleted org=%s brand=%s by=%s", org_id, brand_id, user.id)


# ---------------------------------------------------------------------------
# Activate
# ---------------------------------------------------------------------------


@router.post("/api/orgs/{org_id}/brands/{brand_id}/activate", response_model=BrandResponse)
@limiter.limit("30/minute")
async def activate_brand(
    request: Request,
    org_id: str,
    brand_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    brand = await _load_brand_for_admin(db, org_id, brand_id, user)
    # Deactivate every brand in this org, then mark target active.
    await db.execute(
        update(OrgBrand)
        .where(OrgBrand.org_id == org_id, OrgBrand.id != brand.id)
        .values(is_active=False)
    )
    brand.is_active = True
    # Sync the org default theme if this brand carries one.
    if brand.theme_id:
        org_theme_result = await db.execute(select(OrgTheme).where(OrgTheme.org_id == org_id))
        org_theme = org_theme_result.scalar_one_or_none()
        if org_theme is None:
            db.add(OrgTheme(org_id=org_id, theme_id=brand.theme_id, auto_light_dark=None))
        else:
            org_theme.theme_id = brand.theme_id
    await db.commit()
    await db.refresh(brand)
    logger.info("brand_activated org=%s brand=%s by=%s", org_id, brand.id, user.id)
    return _to_response(brand, org_id)


# ---------------------------------------------------------------------------
# Duplicate
# ---------------------------------------------------------------------------


@router.post("/api/orgs/{org_id}/brands/{brand_id}/duplicate", response_model=BrandResponse)
@limiter.limit("20/minute")
async def duplicate_brand(
    request: Request,
    org_id: str,
    brand_id: str,
    body: BrandDuplicateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandResponse:
    original = await _load_brand_for_admin(db, org_id, brand_id, user)
    new_name = (body.name or f"{original.name} copy").strip()[:100] or "Copy"

    # If the brand backs a custom org theme, clone the underlying preset
    # so editing the duplicate's theme can't bleed back into the original.
    new_theme_id = original.theme_id
    if original.theme_id and original.theme_id.startswith("custom:"):
        preset_id = original.theme_id.removeprefix("custom:")
        preset_result = await db.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
        original_preset = preset_result.scalar_one_or_none()
        if original_preset is not None:
            new_preset = ThemePreset(
                name=f"{original_preset.name} copy"[:100],
                scope=original_preset.scope,
                owner_user_id=original_preset.owner_user_id,
                org_id=original_preset.org_id,
                base_preset=original_preset.base_preset,
                color_scheme=original_preset.color_scheme,
                tokens=deepcopy(original_preset.tokens),
                version=1,
            )
            db.add(new_preset)
            await db.flush()
            new_theme_id = f"custom:{new_preset.id}"

    duplicate = OrgBrand(
        org_id=org_id,
        name=new_name,
        is_active=False,
        app_name=original.app_name,
        tagline=original.tagline,
        logo_url=original.logo_url,
        favicon_url=original.favicon_url,
        source_url=original.source_url,
        theme_id=new_theme_id,
    )
    db.add(duplicate)
    await db.commit()
    await db.refresh(duplicate)
    logger.info(
        "brand_duplicated org=%s from=%s to=%s by=%s",
        org_id,
        original.id,
        duplicate.id,
        user.id,
    )
    return _to_response(duplicate, org_id)


# ---------------------------------------------------------------------------
# Generate (AI) — does not persist
# ---------------------------------------------------------------------------


@router.post("/api/orgs/{org_id}/brand/generate", response_model=BrandSuggestion)
@limiter.limit("10/minute")
async def generate_brand_suggestion(
    request: Request,
    org_id: str,
    body: BrandGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandSuggestion:
    await require_org_admin(org_id, user, db)
    try:
        suggestion = await brand_generator.generate_brand(db, org_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return suggestion


# ---------------------------------------------------------------------------
# Apply — always creates a new saved brand row, deactivates others
# ---------------------------------------------------------------------------


def _derive_brand_name(body: BrandApplyRequest) -> str:
    if body.name:
        return body.name.strip()[:100]
    if body.app_name:
        return f"{body.app_name} brand".strip()[:100]
    return "Brand"


@router.post("/api/orgs/{org_id}/brand/apply", response_model=BrandApplyResponse)
@limiter.limit("20/minute")
async def apply_brand(
    request: Request,
    org_id: str,
    body: BrandApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrandApplyResponse:
    await require_org_admin(org_id, user, db)

    # 1. Persist as an org-shared theme preset.
    preset = ThemePreset(
        name=body.theme_name,
        scope="org",
        owner_user_id=None,
        org_id=org_id,
        base_preset=body.theme.base_preset,
        color_scheme=body.theme.color_scheme,
        tokens=body.theme.tokens,
        version=1,
    )
    db.add(preset)
    await db.flush()
    theme_ref = f"custom:{preset.id}"

    # 2. Upsert org_themes — set this preset as the org default.
    org_theme_result = await db.execute(select(OrgTheme).where(OrgTheme.org_id == org_id))
    org_theme = org_theme_result.scalar_one_or_none()
    if org_theme is None:
        db.add(OrgTheme(org_id=org_id, theme_id=theme_ref, auto_light_dark=None))
    else:
        org_theme.theme_id = theme_ref

    # 3. Deactivate every existing active brand for this org.
    await db.execute(
        update(OrgBrand).where(OrgBrand.org_id == org_id).values(is_active=False)
    )

    # 4. Create a new active brand row.
    brand = OrgBrand(
        org_id=org_id,
        name=_derive_brand_name(body),
        is_active=True,
        app_name=body.app_name,
        tagline=body.tagline,
        logo_url=body.logo_url,
        favicon_url=body.favicon_url,
        source_url=body.source_url,
        theme_id=theme_ref,
    )
    db.add(brand)

    await db.commit()
    await db.refresh(brand)
    logger.info(
        "brand_applied org=%s brand=%s preset=%s by=%s",
        org_id,
        brand.id,
        preset.id,
        user.id,
    )
    return BrandApplyResponse(
        org_id=org_id,
        theme_id=theme_ref,
        brand=_to_response(brand, org_id),
    )


# ---------------------------------------------------------------------------
# Logo upload
# ---------------------------------------------------------------------------


@router.post("/api/orgs/{org_id}/brand/logo")
@limiter.limit("20/minute")
async def upload_logo(
    request: Request,
    org_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await require_org_admin(org_id, user, db)
    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported logo type: {file.content_type}")
    content = await file.read()
    if len(content) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo too large (max 2 MB)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "logo").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
        ext = ".png"
    filename = f"brand-{org_id}-{uuid.uuid4().hex[:8]}{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(content)
    logger.info("brand_logo_uploaded org=%s file=%s by=%s", org_id, filename, user.id)
    return {
        "url": f"/uploads/{filename}",
        "filename": filename,
        "content_type": file.content_type,
        "size": len(content),
    }
