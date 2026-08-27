"""Pydantic schemas for the org-branding endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from .theme import ThemeDoc

MAX_NAME = 100
MAX_TAGLINE = 200
MAX_URL = 500


class BrandResponse(BaseModel):
    """A saved brand. Multiple per org; exactly one is_active at a time."""

    id: str | None = None  # None when no row exists yet (empty org).
    org_id: str
    name: str | None = None
    is_active: bool = False
    app_name: str | None = None
    tagline: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    source_url: str | None = None
    theme_id: str | None = None


class BrandUpdate(BaseModel):
    """Per-id PUT — admin updates a saved brand's metadata."""

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME)
    app_name: str | None = Field(default=None, max_length=MAX_NAME)
    tagline: str | None = Field(default=None, max_length=MAX_TAGLINE)
    logo_url: str | None = Field(default=None, max_length=MAX_URL)
    favicon_url: str | None = Field(default=None, max_length=MAX_URL)
    source_url: str | None = Field(default=None, max_length=MAX_URL)
    theme_id: str | None = Field(default=None, max_length=64)


class BrandDuplicateRequest(BaseModel):
    """Optional rename for a duplicated brand."""

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME)


class BrandGenerateRequest(BaseModel):
    """Inputs for AI brand analysis. At least one must be set."""

    url: str | None = Field(default=None, max_length=MAX_URL)
    color_hint: str | None = Field(default=None, max_length=32)
    brand_description: str | None = Field(default=None, max_length=500)
    logo_url: str | None = Field(default=None, max_length=MAX_URL)
    color_scheme: str | None = Field(default=None, max_length=10)

    @field_validator("color_scheme")
    @classmethod
    def _scheme(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ("light", "dark"):
            raise ValueError("color_scheme must be 'light' or 'dark'")
        return v


class BrandSuggestion(BaseModel):
    """AI-generated brand suggestion. Not yet persisted."""

    app_name: str | None = None
    tagline: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    source_url: str | None = None
    theme: ThemeDoc
    reasoning: str | None = None


class BrandApplyRequest(BaseModel):
    """Persist a brand suggestion as a new saved brand row.

    Always creates a new ``OrgBrand`` row with ``is_active=True`` and
    deactivates any prior active brand. The underlying theme preset is
    created as ``scope=org`` and ``org_themes`` is updated to point at it.
    """

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME)
    app_name: str | None = Field(default=None, max_length=MAX_NAME)
    tagline: str | None = Field(default=None, max_length=MAX_TAGLINE)
    logo_url: str | None = Field(default=None, max_length=MAX_URL)
    favicon_url: str | None = Field(default=None, max_length=MAX_URL)
    source_url: str | None = Field(default=None, max_length=MAX_URL)
    theme: ThemeDoc
    theme_name: str = Field(min_length=1, max_length=100)


class BrandApplyResponse(BaseModel):
    org_id: str
    theme_id: str
    brand: BrandResponse
