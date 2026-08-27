from datetime import datetime
from typing import Any

from pydantic import BaseModel


# Acceptance criteria items can be either a legacy bare string or a
# ``{"text": "...", "done": false}`` object. The frontend writes the new
# shape; the backend tolerates both on read and writes through whatever it
# receives. ``normalize_acceptance_criteria`` flattens the union when needed.
AcceptanceCriterion = dict[str, Any] | str


class CardCreate(BaseModel):
    column_id: str
    title: str
    description: str | None = None
    priority: str | None = None
    story_points: int | None = None
    assignee_id: str | None = None
    labels: list[str] = []
    acceptance_criteria: list[AcceptanceCriterion] = []
    parent_card_id: str | None = None


class CardUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    story_points: int | None = None
    column_id: str | None = None
    position: int | None = None
    assignee_id: str | None = None
    labels: list[str] | None = None
    acceptance_criteria: list[AcceptanceCriterion] | None = None
    # Allow type changes from the ticket sidebar. Setting this re-stamps
    # template_id on the card; template_version stays put because we can't
    # know whether the user wants the latest template snapshot or not.
    template_id: str | None = None


class CardResponse(BaseModel):
    id: str
    column_id: str
    position: int
    title: str
    description: str | None
    priority: str | None
    story_points: int | None
    assignee_id: str | None
    assignee_name: str | None = None
    assignee_email: str | None = None
    labels: list
    acceptance_criteria: list
    parent_card_id: str | None
    depends_on: list = []
    auto_approve: bool = False
    agent_status: str | None = None
    agent_pr_url: str | None = None
    agent_branch: str | None = None
    agent_log: list = []
    session_id: str | None = None
    created_at: datetime
    updated_at: datetime

    # Friendly id and template fields (Phase 0).
    project_id: str | None = None
    number: int | None = None
    friendly_id: str | None = None
    template_id: str | None = None
    template_version: int | None = None
    custom_fields: dict = {}

    # Aggregated counts populated by board endpoint to avoid N+1 fetches.
    attachment_count: int = 0
    link_count: int = 0
    comment_count: int = 0
    is_blocked: bool = False
    sync_status: dict | None = None

    # Execution-order numbering. wave + sequence are persisted on the model;
    # exec_label is derived per board response from (wave, sequence, wave size).
    wave: int | None = None
    sequence: int | None = None
    exec_label: str | None = None

    model_config = {"from_attributes": True}


class ColumnCreate(BaseModel):
    name: str
    position: int | None = None
    wip_limit: int | None = None
    is_start_state: bool = False
    is_done_state: bool = False
    agent_trigger_state: bool = False
    agent_review_state: bool = False
    accent_color: str | None = None


class ColumnUpdate(BaseModel):
    name: str | None = None
    position: int | None = None
    wip_limit: int | None = None
    is_start_state: bool | None = None
    is_done_state: bool | None = None
    agent_trigger_state: bool | None = None
    agent_review_state: bool | None = None
    accent_color: str | None = None


class ColumnReorderRequest(BaseModel):
    """Bulk-reorder columns. `column_ids` is the new order, top→bottom."""

    column_ids: list[str]


class ColumnDeleteRequest(BaseModel):
    """Optional fallback target when deleting a non-empty column.

    If `reassign_to` is None, cards in the column move to the first remaining
    column (lowest position). Pass an explicit id to pick a destination.
    """

    reassign_to: str | None = None


class ColumnResponse(BaseModel):
    id: str
    name: str
    position: int
    wip_limit: int | None
    is_start_state: bool = False
    is_done_state: bool = False
    agent_trigger_state: bool = False
    agent_review_state: bool = False
    accent_color: str | None = None
    cards: list[CardResponse] = []

    model_config = {"from_attributes": True}


class BoardResponse(BaseModel):
    id: str
    project_id: str
    columns: list[ColumnResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketCommentResponse(BaseModel):
    id: str
    card_id: str
    user_id: str
    user_name: str | None = None
    content: str
    created_at: datetime


class TicketAttachmentResponse(BaseModel):
    id: str
    card_id: str
    filename: str
    mime_type: str
    size_bytes: int
    url: str
    width: int | None = None
    height: int | None = None
    uploaded_by: str
    created_at: datetime


class TicketLinkOther(BaseModel):
    id: str
    friendly_id: str | None
    title: str
    status: str | None = None


class TicketLinkResponse(BaseModel):
    id: str
    link_type: str
    direction: str  # "outbound" | "inbound"
    other_card: TicketLinkOther


class TicketActivityEventResponse(BaseModel):
    id: str
    kind: str
    actor_id: str | None
    actor_name: str | None = None
    payload: dict = {}
    created_at: datetime


class TicketBoardColumnLite(BaseModel):
    """Minimal column shape the ticket sidebar needs to render the status
    selector. Avoids round-tripping the entire ColumnResponse + nested cards."""

    id: str
    name: str
    position: int = 0
    is_done_state: bool = False


class TicketDetailResponse(BaseModel):
    """Full ticket detail returned by GET /api/tickets/{id_or_key}.

    Wraps the Card alongside its attachments, links, comments, and activity feed.
    Empty arrays for the new tables until later phases populate them.
    """

    card: CardResponse
    project_key: str | None = None
    project_name: str | None = None
    board_id: str | None = None
    board_columns: list[TicketBoardColumnLite] = []
    attachments: list[TicketAttachmentResponse] = []
    links: list[TicketLinkResponse] = []
    comments: list[TicketCommentResponse] = []
    events: list[TicketActivityEventResponse] = []

    model_config = {"from_attributes": True}
