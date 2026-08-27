"""Theme endpoints — built-in presets, custom presets, and user/org settings."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_org_admin, require_org_member
from ..middleware.rate_limit import limiter
from ..models.organization import OrgMember
from ..models.theme import OrgTheme, ThemePreset, UserThemePreference
from ..models.user import User
from ..schemas.theme import (
    AutoLightDark,
    OrgThemeResponse,
    OrgThemeUpdate,
    ResolvedTheme,
    ThemePresetCreate,
    ThemePresetResponse,
    ThemePresetSummary,
    ThemePresetUpdate,
    UserThemePreferenceResponse,
    UserThemePreferenceUpdate,
)
from ..services import theme_presets
from ..services.theme_resolver import resolve_for_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["themes"])


# ---------------------------------------------------------------------------
# Resolved theme for the current user
# ---------------------------------------------------------------------------


@router.get("/api/themes/me", response_model=ResolvedTheme)
@limiter.limit("120/minute")
async def get_my_theme(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResolvedTheme:
    return await resolve_for_user(db, user)


# ---------------------------------------------------------------------------
# User preference
# ---------------------------------------------------------------------------


def _pref_to_response(pref: UserThemePreference | None, user_id: str) -> UserThemePreferenceResponse:
    if pref is None:
        return UserThemePreferenceResponse(
            user_id=user_id,
            mode="org_default",
            theme_id=None,
            auto_light_id=None,
            auto_dark_id=None,
        )
    return UserThemePreferenceResponse(
        user_id=pref.user_id,
        mode=pref.mode,  # type: ignore[arg-type]
        theme_id=pref.theme_id,
        auto_light_id=pref.auto_light_id,
        auto_dark_id=pref.auto_dark_id,
    )


@router.get("/api/users/me/theme-preference", response_model=UserThemePreferenceResponse)
@limiter.limit("60/minute")
async def get_my_preference(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserThemePreferenceResponse:
    result = await db.execute(
        select(UserThemePreference).where(UserThemePreference.user_id == user.id)
    )
    return _pref_to_response(result.scalar_one_or_none(), user.id)


@router.put("/api/users/me/theme-preference", response_model=UserThemePreferenceResponse)
@limiter.limit("30/minute")
async def update_my_preference(
    request: Request,
    body: UserThemePreferenceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserThemePreferenceResponse:
    # If pointing at a custom preset, verify the user is allowed to use it.
    candidate_ids: list[str] = []
    if body.mode == "explicit" and body.theme_id:
        candidate_ids.append(body.theme_id)
    if body.mode == "system":
        if body.auto_light_id:
            candidate_ids.append(body.auto_light_id)
        if body.auto_dark_id:
            candidate_ids.append(body.auto_dark_id)
    for tid in candidate_ids:
        if not await _user_can_use_theme(db, user, tid):
            raise HTTPException(status_code=403, detail=f"Theme not available: {tid}")

    result = await db.execute(
        select(UserThemePreference).where(UserThemePreference.user_id == user.id)
    )
    pref = result.scalar_one_or_none()
    if pref is None:
        pref = UserThemePreference(
            user_id=user.id,
            mode=body.mode,
            theme_id=body.theme_id,
            auto_light_id=body.auto_light_id,
            auto_dark_id=body.auto_dark_id,
        )
        db.add(pref)
    else:
        pref.mode = body.mode
        pref.theme_id = body.theme_id
        pref.auto_light_id = body.auto_light_id
        pref.auto_dark_id = body.auto_dark_id
    await db.commit()
    await db.refresh(pref)
    return _pref_to_response(pref, user.id)


async def _user_can_use_theme(db: AsyncSession, user: User, theme_id: str) -> bool:
    if theme_presets.is_builtin_preset_id(theme_id):
        return True
    if not theme_id.startswith("custom:"):
        return False
    preset_id = theme_id.removeprefix("custom:")
    result = await db.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
    preset = result.scalar_one_or_none()
    if preset is None:
        return False
    if preset.scope == "user" and preset.owner_user_id == user.id:
        return True
    if preset.scope == "org":
        member_result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == preset.org_id,
                OrgMember.user_id == user.id,
            )
        )
        return member_result.scalar_one_or_none() is not None
    return False


# ---------------------------------------------------------------------------
# Org theme
# ---------------------------------------------------------------------------


@router.get("/api/orgs/{org_id}/theme", response_model=OrgThemeResponse)
@limiter.limit("60/minute")
async def get_org_theme(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgThemeResponse:
    await require_org_member(org_id, user, db)
    result = await db.execute(select(OrgTheme).where(OrgTheme.org_id == org_id))
    org_theme = result.scalar_one_or_none()
    if org_theme is None:
        return OrgThemeResponse(org_id=org_id, theme_id=theme_presets.DEFAULT_THEME_ID)
    auto = AutoLightDark(**org_theme.auto_light_dark) if org_theme.auto_light_dark else None
    return OrgThemeResponse(org_id=org_id, theme_id=org_theme.theme_id, auto_light_dark=auto)


@router.put("/api/orgs/{org_id}/theme", response_model=OrgThemeResponse)
@limiter.limit("30/minute")
async def update_org_theme(
    request: Request,
    org_id: str,
    body: OrgThemeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgThemeResponse:
    await require_org_admin(org_id, user, db)

    # Verify referenced theme exists and is usable for this org.
    if not theme_presets.is_builtin_preset_id(body.theme_id):
        if not body.theme_id.startswith("custom:"):
            raise HTTPException(status_code=422, detail="Invalid theme_id format")
        preset_id = body.theme_id.removeprefix("custom:")
        preset_result = await db.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
        preset = preset_result.scalar_one_or_none()
        if preset is None:
            raise HTTPException(status_code=404, detail="Theme preset not found")
        if preset.scope != "org" or preset.org_id != org_id:
            raise HTTPException(
                status_code=400,
                detail="Only org-shared custom themes can be set as the org default",
            )

    result = await db.execute(select(OrgTheme).where(OrgTheme.org_id == org_id))
    org_theme = result.scalar_one_or_none()
    if org_theme is None:
        org_theme = OrgTheme(
            org_id=org_id,
            theme_id=body.theme_id,
            auto_light_dark=body.auto_light_dark.model_dump() if body.auto_light_dark else None,
        )
        db.add(org_theme)
    else:
        org_theme.theme_id = body.theme_id
        org_theme.auto_light_dark = (
            body.auto_light_dark.model_dump() if body.auto_light_dark else None
        )
    await db.commit()
    await db.refresh(org_theme)
    auto = AutoLightDark(**org_theme.auto_light_dark) if org_theme.auto_light_dark else None
    return OrgThemeResponse(org_id=org_id, theme_id=org_theme.theme_id, auto_light_dark=auto)


# ---------------------------------------------------------------------------
# Theme presets (custom themes)
# ---------------------------------------------------------------------------


@router.get("/api/themes/presets", response_model=list[ThemePresetSummary])
@limiter.limit("60/minute")
async def list_presets(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ThemePresetSummary]:
    """List custom presets visible to the user (their own + org-shared)."""
    org_ids_result = await db.execute(
        select(OrgMember.org_id).where(OrgMember.user_id == user.id)
    )
    org_ids = [row[0] for row in org_ids_result.all()]

    own_result = await db.execute(
        select(ThemePreset).where(
            (ThemePreset.scope == "user") & (ThemePreset.owner_user_id == user.id)
        )
    )
    own = own_result.scalars().all()
    org_shared: list[ThemePreset] = []
    if org_ids:
        org_result = await db.execute(
            select(ThemePreset).where(
                (ThemePreset.scope == "org") & (ThemePreset.org_id.in_(org_ids))
            )
        )
        org_shared = list(org_result.scalars().all())
    return [ThemePresetSummary.model_validate(p) for p in [*own, *org_shared]]


@router.post("/api/themes/presets", response_model=ThemePresetResponse, status_code=201)
@limiter.limit("30/minute")
async def create_preset(
    request: Request,
    body: ThemePresetCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ThemePresetResponse:
    if body.scope == "org":
        if not body.org_id:
            raise HTTPException(status_code=422, detail="org_id is required for scope='org'")
        await require_org_admin(body.org_id, user, db)
    preset = ThemePreset(
        name=body.name,
        scope=body.scope,
        owner_user_id=user.id if body.scope == "user" else None,
        org_id=body.org_id if body.scope == "org" else None,
        base_preset=body.base_preset,
        color_scheme=body.color_scheme,
        tokens=body.tokens,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    logger.info("theme_preset_created id=%s scope=%s by=%s", preset.id, preset.scope, user.id)
    return ThemePresetResponse.model_validate(preset)


@router.get("/api/themes/presets/{preset_id}", response_model=ThemePresetResponse)
@limiter.limit("60/minute")
async def get_preset(
    request: Request,
    preset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ThemePresetResponse:
    preset = await _load_preset_for_user(db, preset_id, user)
    return ThemePresetResponse.model_validate(preset)


@router.put("/api/themes/presets/{preset_id}", response_model=ThemePresetResponse)
@limiter.limit("30/minute")
async def update_preset(
    request: Request,
    preset_id: str,
    body: ThemePresetUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ThemePresetResponse:
    preset = await _load_preset_for_user(db, preset_id, user, require_write=True)
    if body.name is not None:
        preset.name = body.name
    if body.color_scheme is not None:
        preset.color_scheme = body.color_scheme
    if body.base_preset is not None:
        preset.base_preset = body.base_preset
    if body.tokens is not None:
        preset.tokens = body.tokens
    await db.commit()
    await db.refresh(preset)
    return ThemePresetResponse.model_validate(preset)


@router.delete("/api/themes/presets/{preset_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_preset(
    request: Request,
    preset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    preset = await _load_preset_for_user(db, preset_id, user, require_write=True)
    # Refuse if it's currently set as an org default.
    org_theme_result = await db.execute(
        select(OrgTheme).where(OrgTheme.theme_id == f"custom:{preset.id}")
    )
    if org_theme_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="This theme is currently set as the organization default. Set a different org default first.",
        )
    await db.delete(preset)
    await db.commit()


async def _load_preset_for_user(
    db: AsyncSession,
    preset_id: str,
    user: User,
    require_write: bool = False,
) -> ThemePreset:
    result = await db.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=404, detail="Theme preset not found")
    if preset.scope == "user":
        if preset.owner_user_id != user.id:
            raise HTTPException(status_code=403, detail="Not your theme")
        return preset
    # scope == 'org'
    if require_write:
        if not preset.org_id:
            raise HTTPException(status_code=500, detail="Org preset missing org_id")
        await require_org_admin(preset.org_id, user, db)
        return preset
    # Read access: any member of the org may see the preset.
    if preset.org_id is None:
        raise HTTPException(status_code=500, detail="Org preset missing org_id")
    await require_org_member(preset.org_id, user, db)
    return preset


# ---------------------------------------------------------------------------
# Built-in preset summaries (no auth required for catalog)
# ---------------------------------------------------------------------------


@router.get("/api/themes/builtins")
@limiter.limit("120/minute")
async def list_builtin_presets(request: Request) -> list[dict]:
    return theme_presets.all_builtin_summaries()
