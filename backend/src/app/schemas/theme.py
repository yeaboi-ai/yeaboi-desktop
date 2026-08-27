"""Pydantic schemas for theming endpoints.

These mirror the TypeScript types in
``frontend/lib/theme/types.ts``. Token names are validated against an
allowlist so older or renamed tokens cannot sneak in via custom presets.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Allowed token keys (must match frontend/lib/theme/types.ts TOKEN_KEYS).
TOKEN_KEYS: frozenset[str] = frozenset(
    {
        "background",
        "foreground",
        "card",
        "card-foreground",
        "popover",
        "popover-foreground",
        "primary",
        "primary-foreground",
        "secondary",
        "secondary-foreground",
        "muted",
        "muted-foreground",
        "accent",
        "accent-foreground",
        "destructive",
        "destructive-foreground",
        "success",
        "success-foreground",
        "warning",
        "warning-foreground",
        "info",
        "info-foreground",
        "border",
        "input",
        "ring",
        "chart-1",
        "chart-2",
        "chart-3",
        "chart-4",
        "chart-5",
        "chart-6",
        "chart-7",
        "chart-8",
        "chart-grid",
        "chart-axis",
        "chart-tooltip-bg",
        "chart-tooltip-fg",
        "canvas-bg",
        "canvas-grid",
        "canvas-grid-strong",
        "canvas-node-bg",
        "canvas-node-fg",
        "canvas-node-border",
        "canvas-edge-default",
        "canvas-edge-selected",
        "canvas-edge-hover",
        "canvas-handle",
        "canvas-selection-fill",
        "canvas-selection-stroke",
        "canvas-minimap-mask",
        "canvas-minimap-node",
        "livekit-tile-bg",
        "livekit-screen-bg",
        "selection-bg",
        "selection-fg",
        "scrollbar-thumb",
        "scrollbar-thumb-hover",
        "grid-placeholder-bg",
        "grid-placeholder-border",
        "glow-primary-shadow",
        "wireframe-bg",
        "wireframe-fg",
        "wireframe-accent",
    }
)

# Tokens that must hold solid hex (everything else may carry rgba/box-shadow).
HEX_ONLY_TOKEN_KEYS: frozenset[str] = frozenset(
    {
        "background",
        "foreground",
        "card",
        "card-foreground",
        "popover",
        "popover-foreground",
        "primary",
        "primary-foreground",
        "secondary",
        "secondary-foreground",
        "muted",
        "muted-foreground",
        "accent",
        "accent-foreground",
        "destructive",
        "destructive-foreground",
        "success",
        "success-foreground",
        "warning",
        "warning-foreground",
        "info",
        "info-foreground",
        "border",
        "input",
        "ring",
        "chart-1",
        "chart-2",
        "chart-3",
        "chart-4",
        "chart-5",
        "chart-6",
        "chart-7",
        "chart-8",
        "chart-tooltip-bg",
        "chart-tooltip-fg",
        "canvas-bg",
        "canvas-node-bg",
        "canvas-node-fg",
        "canvas-edge-selected",
        "canvas-handle",
        "livekit-tile-bg",
        "livekit-screen-bg",
        "selection-fg",
        "scrollbar-thumb",
        "scrollbar-thumb-hover",
        "wireframe-bg",
        "wireframe-fg",
        "wireframe-accent",
    }
)

HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
RGB_RE = re.compile(
    r"^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+|1\.0+))?\s*\)$"
)

ColorScheme = Literal["light", "dark"]
ThemeMode = Literal["explicit", "org_default", "system"]
PresetScope = Literal["user", "org"]

MAX_TOKENS_BYTES = 4096


def _normalize_hex(value: str) -> str:
    if not HEX_RE.match(value):
        raise ValueError(f"Invalid hex color: {value!r}")
    if len(value) == 4:  # #abc → #aabbcc
        v = value[1:]
        return "#" + "".join(c + c for c in v).lower()
    return "#" + value[1:].lower()


def _validate_token_value(key: str, value: str) -> str:
    """Hex tokens get strict validation; others accept rgba()/box-shadow."""
    if key in HEX_ONLY_TOKEN_KEYS:
        return _normalize_hex(value)
    # Permissive: hex, rgb(a), or a CSS expression (used by glow shadow).
    return value


class TokenMap(BaseModel):
    """Wrapper that validates the full token map up-front."""

    tokens: dict[str, str]

    @field_validator("tokens")
    @classmethod
    def validate_tokens(cls, v: dict[str, str]) -> dict[str, str]:
        if not v:
            raise ValueError("tokens must not be empty")
        out: dict[str, str] = {}
        for key, value in v.items():
            if key not in TOKEN_KEYS:
                raise ValueError(f"Unknown token key: {key!r}")
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"Token {key!r} must be a non-empty string")
            out[key] = _validate_token_value(key, value)
        return out


def _validate_tokens_payload(tokens: dict[str, str]) -> dict[str, str]:
    validated = TokenMap(tokens=tokens).tokens
    encoded = json.dumps(validated, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_TOKENS_BYTES:
        raise ValueError(f"tokens JSON exceeds {MAX_TOKENS_BYTES} bytes")
    return validated


# ---------------------------------------------------------------------------
# Theme docs (as returned to the frontend)
# ---------------------------------------------------------------------------


class AutoLightDark(BaseModel):
    light_theme_id: str
    dark_theme_id: str


class ThemeDoc(BaseModel):
    version: int = 1
    name: str
    base_preset: str | None = None
    color_scheme: ColorScheme
    tokens: dict[str, str]
    auto_light_dark: AutoLightDark | None = None


class ThemePresetSummary(BaseModel):
    id: str
    name: str
    scope: PresetScope
    color_scheme: ColorScheme
    base_preset: str | None
    owner_user_id: str | None
    org_id: str | None

    model_config = {"from_attributes": True}


class ThemePresetResponse(BaseModel):
    id: str
    name: str
    scope: PresetScope
    color_scheme: ColorScheme
    base_preset: str | None
    owner_user_id: str | None
    org_id: str | None
    tokens: dict[str, str]
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ThemePresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scope: PresetScope
    color_scheme: ColorScheme
    base_preset: str | None = None
    tokens: dict[str, str]
    org_id: str | None = None  # required when scope='org'

    @model_validator(mode="after")
    def _check(self) -> ThemePresetCreate:
        if self.scope == "org" and not self.org_id:
            raise ValueError("org_id is required when scope='org'")
        if self.scope == "user" and self.org_id:
            raise ValueError("org_id must be omitted when scope='user'")
        self.tokens = _validate_tokens_payload(self.tokens)
        return self


class ThemePresetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color_scheme: ColorScheme | None = None
    base_preset: str | None = None
    tokens: dict[str, str] | None = None

    @model_validator(mode="after")
    def _check(self) -> ThemePresetUpdate:
        if self.tokens is not None:
            self.tokens = _validate_tokens_payload(self.tokens)
        return self


# ---------------------------------------------------------------------------
# Org theme
# ---------------------------------------------------------------------------


class OrgThemeResponse(BaseModel):
    org_id: str
    theme_id: str
    auto_light_dark: AutoLightDark | None = None


class OrgThemeUpdate(BaseModel):
    theme_id: str = Field(min_length=1, max_length=64)
    auto_light_dark: AutoLightDark | None = None


# ---------------------------------------------------------------------------
# User preference
# ---------------------------------------------------------------------------


class UserThemePreferenceResponse(BaseModel):
    user_id: str
    mode: ThemeMode
    theme_id: str | None
    auto_light_id: str | None
    auto_dark_id: str | None


class UserThemePreferenceUpdate(BaseModel):
    mode: ThemeMode
    theme_id: str | None = None
    auto_light_id: str | None = None
    auto_dark_id: str | None = None

    @model_validator(mode="after")
    def _check(self) -> UserThemePreferenceUpdate:
        if self.mode == "explicit" and not self.theme_id:
            raise ValueError("theme_id is required when mode='explicit'")
        if self.mode == "system" and not (self.auto_light_id and self.auto_dark_id):
            raise ValueError("auto_light_id and auto_dark_id are required when mode='system'")
        return self


# ---------------------------------------------------------------------------
# Resolved theme (what GET /api/themes/me returns)
# ---------------------------------------------------------------------------


class ContrastWarning(BaseModel):
    pair: list[str]
    ratio: float
    threshold: float = 4.5


class ResolvedTheme(BaseModel):
    active: ThemeDoc
    light: ThemeDoc | None = None
    dark: ThemeDoc | None = None
    preference: UserThemePreferenceResponse
    source: Literal["explicit", "system", "org_default", "fallback"]
    warnings: list[ContrastWarning] = Field(default_factory=list)
