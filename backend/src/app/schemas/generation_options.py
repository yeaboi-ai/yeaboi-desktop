"""Pydantic schemas for the org-level granularity + modifier CRUD."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from ..services.modifier_service import MODIFIER_CATEGORIES

_SLUG_RE = re.compile(r"^[a-z0-9_]+$")


# ─── shared ─────────────────────────────────────────────────────────────────


def _validate_slug(v: str | None) -> str | None:
    if v is None:
        return v
    if not _SLUG_RE.match(v):
        raise ValueError(
            f"Slug must be lowercase letters, digits, and underscores only — got {v!r}"
        )
    return v


# ─── granularity ────────────────────────────────────────────────────────────


class GranularityCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    slug: str | None = Field(default=None, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    prompt_fragment: str = Field(default="", max_length=4000)
    sort_order: int = 0

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str | None) -> str | None:
        return _validate_slug(v)


class GranularityUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    prompt_fragment: str | None = Field(default=None, max_length=4000)
    sort_order: int | None = None
    # Note: ``slug`` is immutable post-create. Saved combinations on
    # projects + presets reference slugs, so renaming would break them.


class GranularityResponse(BaseModel):
    id: str
    slug: str
    label: str
    blurb: str | None
    prompt_fragment: str
    sort_order: int
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── modifier ───────────────────────────────────────────────────────────────


class ModifierCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    slug: str | None = Field(default=None, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    category: str = "shape"
    prompt_fragment: str = Field(default="", max_length=4000)
    sort_order: int = 0

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str | None) -> str | None:
        return _validate_slug(v)

    @field_validator("category")
    @classmethod
    def _v_category(cls, v: str) -> str:
        if v not in MODIFIER_CATEGORIES:
            raise ValueError(
                f"Unknown category {v!r}. Valid: {list(MODIFIER_CATEGORIES)}"
            )
        return v


class ModifierUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    category: str | None = None
    prompt_fragment: str | None = Field(default=None, max_length=4000)
    sort_order: int | None = None

    @field_validator("category")
    @classmethod
    def _v_category(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in MODIFIER_CATEGORIES:
            raise ValueError(
                f"Unknown category {v!r}. Valid: {list(MODIFIER_CATEGORIES)}"
            )
        return v


class ModifierResponse(BaseModel):
    id: str
    slug: str
    label: str
    blurb: str | None
    category: str
    prompt_fragment: str
    sort_order: int
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
