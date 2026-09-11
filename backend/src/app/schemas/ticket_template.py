from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TicketTemplateFieldSchema(BaseModel):
    """One row in a template's field_schema. Validated lightly — value typing is
    enforced on the card-side when custom_fields is written."""

    key: str = Field(..., min_length=1, max_length=60)
    label: str = Field(..., min_length=1, max_length=100)
    type: str = Field(default="text")  # text | number | date | url | select | multi_select
    required: bool = False
    options: list[str] | None = None  # for select / multi_select


class TicketTemplateFieldLayoutEntry(BaseModel):
    """One ordered entry in the unified field layout.

    Built-in entries (``source="builtin"``) carry a fixed ``key`` from the
    set {title, description, acceptance_criteria, activity, status, priority,
    assignee, story_points, labels, sync, links} and a locked ``type`` that
    mirrors the underlying Card column. Custom entries use
    ``key="custom:<slug>"`` and any of the simple input types.

    The ``attachments`` field type is deprecated — image and file uploads
    happen inline inside description/comments via the rich text editor. Old
    layouts that still reference it are stripped by Alembic migration
    ``a2b3c4d5e6f7``.
    """

    key: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=100)
    type: str
    source: str = Field(..., pattern=r"^(builtin|custom)$")
    placement: str = Field(..., pattern=r"^(main|sidebar|header)$")
    visible: bool = True
    required: bool = False
    options: list[str] | None = None


class TicketTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    icon: str = "zap"
    session_id: str | None = None
    default_priority: str | None = None
    default_story_points: int | None = None
    default_labels: list[str] = []
    prompt_fragment: str = ""
    field_schema: list[TicketTemplateFieldSchema] = []
    field_layout: list[TicketTemplateFieldLayoutEntry] | None = None
    acceptance_criteria_template: list[str] = []
    applicability: dict = {}
    sort_order: int = 0


class TicketTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    default_priority: str | None = None
    default_story_points: int | None = None
    default_labels: list[str] | None = None
    prompt_fragment: str | None = None
    field_schema: list[TicketTemplateFieldSchema] | None = None
    field_layout: list[TicketTemplateFieldLayoutEntry] | None = None
    acceptance_criteria_template: list[str] | None = None
    applicability: dict | None = None
    sort_order: int | None = None


class TicketTemplateResponse(BaseModel):
    id: str
    org_id: str
    session_id: str | None
    slug: str
    name: str
    description: str | None
    icon: str
    default_priority: str | None
    default_story_points: int | None
    default_labels: list
    prompt_fragment: str
    field_schema: list
    field_layout: list
    acceptance_criteria_template: list
    applicability: dict
    is_system: bool
    version: int
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
