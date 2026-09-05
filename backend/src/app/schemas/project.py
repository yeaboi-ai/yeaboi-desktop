from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    repo_url: str | None = None
    # Granularity + modifier slugs are validated by the router against the
    # org's editable rows (so admin-created customs are first-class), not
    # against a static enum here. See routers/projects.py:update_project.
    default_generation_style: str | None = None
    default_modifiers: list[str] | None = Field(default=None)
    # Engine link (proj-<8hex>): set once by the renderer after project_create.
    yeaboi_project_id: str | None = None
    # "active" | "done"; the router rejects anything else.
    status: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    repo_url: str | None = None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    is_own_team: bool = False
    is_demo: bool = False
    default_generation_style: str | None = None
    default_modifiers: list[str] = Field(default_factory=list)
    yeaboi_project_id: str | None = None
    status: str = "active"

    model_config = {"from_attributes": True}
