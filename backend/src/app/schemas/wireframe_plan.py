"""Pydantic schemas for the wireframe-plan inference feature.

Contract between the backend `WireframePlanService` and the frontend
plan-card UI. Persisted to `session.diagram_state.wireframe.plan`.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ScreenKind = Literal["screen", "modal", "drawer", "popover", "landing"]
ScreenTier = Literal["hero", "secondary", "optional"]
ScreenStatus = Literal["pending", "approved", "generated", "removed", "failed"]


class ScreenPlan(BaseModel):
    id: str
    name: str
    intent: str
    kind: ScreenKind = "screen"
    tier: ScreenTier = "secondary"
    archetype_source: str | None = None
    domain_source: bool = False
    status: ScreenStatus = "pending"
    # True when this screen belongs in the primary nav (sidebar / tab-bar).
    # False for drill-in surfaces (User Detail clicked from a row), auth
    # screens (Login, Forgot Password), onboarding flows, and profile pages
    # accessed via the avatar menu rather than the nav. Defaults to True so
    # legacy plans without this field don't break the shell.
    nav_visible: bool = True


class WireframePlan(BaseModel):
    archetypes: list[tuple[str, float]] = Field(default_factory=list)
    screens: list[ScreenPlan] = Field(default_factory=list)
    inferred_at: datetime
    last_edited_at: datetime


class InferRequest(BaseModel):
    brief: str = Field(..., min_length=1, max_length=4000)
    device: Literal["mobile", "tablet", "desktop"] = "desktop"


class InferResponse(BaseModel):
    plan: WireframePlan


class ScreenPatch(BaseModel):
    """One patch entry for `PATCH /wireframe/plan`.

    `id` identifies the screen. To add a brand-new screen, set
    `id` to a fresh slug (e.g. `help_center`) plus `name` + `intent`
    + `tier`. To remove, set `status="removed"`. To rename, send
    `name` and/or `intent`.
    """

    id: str
    name: str | None = None
    intent: str | None = None
    kind: ScreenKind | None = None
    tier: ScreenTier | None = None
    status: ScreenStatus | None = None


class PlanPatchRequest(BaseModel):
    screens: list[ScreenPatch]


class PlanPatchResponse(BaseModel):
    plan: WireframePlan


class GenerateRequest(BaseModel):
    """Trigger wireframe generation for a subset of the planned screens.

    Provide either `tier` (generate all non-removed screens at that tier)
    or `screen_ids` (generate exactly those, regardless of tier). If both
    are provided, `screen_ids` wins.
    """

    tier: ScreenTier | None = None
    screen_ids: list[str] | None = None
    device: Literal["mobile", "tablet", "desktop"] = "desktop"


class GenerateResponse(BaseModel):
    started: bool
    screens: list[ScreenPlan]
    plan: WireframePlan
