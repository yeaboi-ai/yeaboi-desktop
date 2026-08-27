"""Pydantic schemas for the org-level generation preset CRUD.

Slug + icon validation lives in the router (after loading the org's
editable granularity + modifier rows) — not here — so admin-created
custom slugs are first-class. Validating against a static enum at the
schema boundary would 422 every reference to a custom slug, defeating
the point of the editable resources.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PresetCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    icon: str = "Layers"
    granularity: str = "balanced"
    modifiers: list[str] = Field(default_factory=list)
    sort_order: int = 0


class PresetUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=64)
    blurb: str | None = Field(default=None, max_length=300)
    icon: str | None = None
    granularity: str | None = None
    modifiers: list[str] | None = None
    sort_order: int | None = None


class PresetResponse(BaseModel):
    id: str
    slug: str
    label: str
    blurb: str | None
    icon: str
    granularity: str
    modifiers: list[str]
    sort_order: int
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
