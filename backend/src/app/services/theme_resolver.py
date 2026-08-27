"""Server-side theme resolution.

Given a user, returns the fully-resolved ``ResolvedTheme`` so the frontend
never has to walk the preset tree itself. Resolution order:

1. ``user_theme_preferences.mode = 'explicit'`` → that theme.
2. ``user_theme_preferences.mode = 'system'`` → return both light and dark
   options; the frontend picks via ``prefers-color-scheme``.
3. ``user_theme_preferences.mode = 'org_default'`` (default for new users)
   → look up the user's primary org theme.
4. No row → fallback to ``preset:dark``.
"""

from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import OrgMember
from ..models.theme import OrgTheme, ThemePreset, UserThemePreference
from ..models.user import User
from ..schemas.theme import (
    ContrastWarning,
    ResolvedTheme,
    ThemeDoc,
    UserThemePreferenceResponse,
)
from . import theme_presets


async def _load_theme_doc(db: AsyncSession, theme_id: str) -> ThemeDoc | None:
    """Resolve a theme_id (built-in or custom:<uuid>) to a full ThemeDoc."""
    if theme_presets.is_builtin_preset_id(theme_id):
        return theme_presets.get_builtin_preset(theme_id)
    if theme_id.startswith("custom:"):
        preset_id = theme_id.removeprefix("custom:")
        result = await db.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
        preset = result.scalar_one_or_none()
        if preset is not None:
            return ThemeDoc(
                version=preset.version,
                name=preset.name,
                base_preset=preset.base_preset,
                color_scheme=preset.color_scheme,  # type: ignore[arg-type]
                tokens=dict(preset.tokens),
            )
    return None


async def _load_org_default_theme(db: AsyncSession, user_id: str) -> ThemeDoc | None:
    """Walk: user → primary org → org_themes → ThemeDoc."""
    membership_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user_id).limit(1)
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        return None
    org_theme_result = await db.execute(
        select(OrgTheme).where(OrgTheme.org_id == membership.org_id)
    )
    org_theme = org_theme_result.scalar_one_or_none()
    if org_theme is None:
        return None
    return await _load_theme_doc(db, org_theme.theme_id)


def _hex_to_rgb(value: str) -> tuple[int, int, int] | None:
    v = value.strip()
    if not v.startswith("#"):
        return None
    v = v[1:]
    if len(v) == 3:
        v = "".join(c + c for c in v)
    if len(v) != 6:
        return None
    try:
        return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    except ValueError:
        return None


def _relative_luminance(rgb: tuple[int, int, int]) -> float:
    def f(v: int) -> float:
        s = v / 255.0
        return s / 12.92 if s <= 0.03928 else math.pow((s + 0.055) / 1.055, 2.4)

    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])


def _contrast(fg_hex: str, bg_hex: str) -> float | None:
    fg = _hex_to_rgb(fg_hex)
    bg = _hex_to_rgb(bg_hex)
    if not fg or not bg:
        return None
    la = _relative_luminance(fg)
    lb = _relative_luminance(bg)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


_CRITICAL_PAIRS: list[tuple[str, str, float]] = [
    ("foreground", "background", 4.5),
    ("primary-foreground", "primary", 4.5),
    ("destructive-foreground", "destructive", 4.5),
    ("muted-foreground", "muted", 3.0),
]


def compute_contrast_warnings(tokens: dict[str, str]) -> list[ContrastWarning]:
    warnings: list[ContrastWarning] = []
    for fg, bg, threshold in _CRITICAL_PAIRS:
        fg_val = tokens.get(fg)
        bg_val = tokens.get(bg)
        if not fg_val or not bg_val:
            continue
        ratio = _contrast(fg_val, bg_val)
        if ratio is None or ratio >= threshold:
            continue
        warnings.append(
            ContrastWarning(pair=[fg, bg], ratio=round(ratio, 2), threshold=threshold)
        )
    return warnings


async def resolve_for_user(db: AsyncSession, user: User) -> ResolvedTheme:
    pref_result = await db.execute(
        select(UserThemePreference).where(UserThemePreference.user_id == user.id)
    )
    pref = pref_result.scalar_one_or_none()

    pref_resp = UserThemePreferenceResponse(
        user_id=user.id,
        mode=pref.mode if pref else "org_default",  # type: ignore[arg-type]
        theme_id=pref.theme_id if pref else None,
        auto_light_id=pref.auto_light_id if pref else None,
        auto_dark_id=pref.auto_dark_id if pref else None,
    )

    active: ThemeDoc | None = None
    light: ThemeDoc | None = None
    dark: ThemeDoc | None = None
    source: str = "fallback"

    if pref and pref.mode == "explicit" and pref.theme_id:
        active = await _load_theme_doc(db, pref.theme_id)
        source = "explicit" if active else "fallback"
    elif pref and pref.mode == "system" and pref.auto_light_id and pref.auto_dark_id:
        light = await _load_theme_doc(db, pref.auto_light_id)
        dark = await _load_theme_doc(db, pref.auto_dark_id)
        active = dark or light  # default to dark when no system hint available
        source = "system" if active else "fallback"
    else:
        active = await _load_org_default_theme(db, user.id)
        source = "org_default" if active else "fallback"

    if active is None:
        active = theme_presets.fallback_theme()

    return ResolvedTheme(
        active=active,
        light=light,
        dark=dark,
        preference=pref_resp,
        source=source,  # type: ignore[arg-type]
        warnings=compute_contrast_warnings(active.tokens),
    )
