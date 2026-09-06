from datetime import datetime

from pydantic import BaseModel, Field, field_validator

#: References one project may carry.
MAX_REFERENCES = 24


class ProjectReference(BaseModel):
    """One thing the project points at. `source` is the connector key (`jira`,
    `github`, `aws`, `link`…), `subject` what the desktop stores (`PROJ-123`,
    `owner/repo`), `label` the words a chip shows."""

    source: str = Field(min_length=1, max_length=64)
    subject: str = Field(min_length=1, max_length=500)
    label: str = Field(min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=2000)

    @field_validator("source", "subject", "label", mode="before")
    @classmethod
    def _strip(cls, value):
        return " ".join(str(value).split()) if isinstance(value, str) else value

    @field_validator("url", mode="before")
    @classmethod
    def _http_only(cls, value):
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if not text.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return text


class ProjectAttachmentResponse(BaseModel):
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    url: str
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str | None = None
    description: str | None = None
    references: list[ProjectReference] | None = Field(default=None, max_length=MAX_REFERENCES)


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
    # Replaces the whole list; deduped on (source, subject) by the router.
    references: list[ProjectReference] | None = Field(default=None, max_length=MAX_REFERENCES)


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
    references: list[ProjectReference] = Field(default_factory=list)
    # Only the detail GET fills this; None elsewhere means "not loaded", not "none".
    attachments: list[ProjectAttachmentResponse] | None = None

    model_config = {"from_attributes": True}
