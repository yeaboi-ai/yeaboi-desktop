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

    model_config = {"from_attributes": True}
