from datetime import datetime

from pydantic import BaseModel

BLUEPRINT_SECTIONS = [
    "project_overview",
    "goals_constraints",
    "users_personas",
    "team_capacity",
    "architecture",
    "tech_stack",
    "api_integrations",
    "ui_ux",
    "security_compliance",
    "infrastructure",
    "risks_unknowns",
    "out_of_scope",
    "open_questions",
]

EMPTY_BLUEPRINT = {section: "" for section in BLUEPRINT_SECTIONS}

# ─── Iteration Types ─────────────────────────────────────────────────────────

ITERATION_TYPES = {
    "large_feature": {
        "label": "Large Feature",
        "icon": "rocket",
        "description": "Full-scope feature requiring architecture, UX, and planning",
        "sections": BLUEPRINT_SECTIONS,  # all 13
        "default_persona": "pm",
    },
    "small_win": {
        "label": "Small Win",
        "icon": "zap",
        "description": "Quick enhancement or minor feature addition",
        "sections": [
            "project_overview",
            "goals_constraints",
            "tech_stack",
            "ui_ux",
            "out_of_scope",
        ],
        "default_persona": "default",
    },
    "bug_fix": {
        "label": "Bug Fix",
        "icon": "bug",
        "description": "Investigate and fix a known issue",
        "sections": [
            "project_overview",
            "architecture",
            "risks_unknowns",
            "open_questions",
        ],
        "default_persona": "challenger",
    },
    "spike": {
        "label": "Spike / Research",
        "icon": "search",
        "description": "Explore a technical question or evaluate options",
        "sections": [
            "project_overview",
            "goals_constraints",
            "open_questions",
            "risks_unknowns",
        ],
        "default_persona": "mentor",
    },
    "refactor": {
        "label": "Refactor",
        "icon": "layers",
        "description": "Restructure existing code or architecture",
        "sections": [
            "architecture",
            "tech_stack",
            "api_integrations",
            "infrastructure",
        ],
        "default_persona": "architect",
    },
    "maintenance": {
        "label": "Maintenance",
        "icon": "wrench",
        "description": "Dependencies, CI/CD, security patches, infra updates",
        "sections": [
            "infrastructure",
            "security_compliance",
            "risks_unknowns",
            "team_capacity",
        ],
        "default_persona": "default",
    },
}


class BlueprintSectionUpdate(BaseModel):
    content: str


class BlueprintSnapshotResponse(BaseModel):
    id: str
    project_id: str
    version_number: int
    content: dict
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BlueprintSnapshotListItem(BaseModel):
    id: str
    version_number: int
    iteration_id: str | None = None
    session_id: str | None = None
    created_by: str
    # Resolved display label (e.g. "Omar Din", "Voice Agent", "System") so the
    # UI doesn't need to know about UUIDs vs literal strings.
    created_by_label: str
    # Section slugs whose content changed in this snapshot (derived from
    # ``diff_from_previous`` so the UI can show "changed: tech_stack, ui_ux"
    # without fetching each snapshot's full content).
    changed_sections: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class BlueprintSnapshotDetail(BaseModel):
    """Full snapshot payload — content + change metadata."""

    id: str
    project_id: str
    version_number: int
    iteration_id: str | None = None
    session_id: str | None = None
    content: dict
    created_by: str
    created_by_label: str
    diff_from_previous: dict | None = None
    section_sources: dict | None = None
    bullet_sources: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BlueprintSnapshotDiff(BaseModel):
    """Section-level diff between two snapshots — only changed sections."""

    from_snapshot_id: str
    to_snapshot_id: str
    from_version: int
    to_version: int
    sections: dict  # {section_slug: {"old": str, "new": str}}


class BlueprintIterationResponse(BaseModel):
    id: str
    project_id: str
    iteration_number: int
    label: str
    display_name: str | None = None
    status: str
    iteration_type: str | None = None
    locked_at: datetime | None = None
    forked_from_id: str | None = None
    parent_out_of_scope: str | None = None
    share_token: str | None = None
    share_enabled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class BlueprintShareResponse(BaseModel):
    """State of an iteration's public read-only share link."""

    iteration_id: str
    share_token: str | None = None
    share_enabled: bool


class SessionBlueprintDiff(BaseModel):
    """Section-level diff between the blueprint state before a session
    started touching it and the latest state. Drives the post-session
    "what changed" review."""

    baseline_snapshot_id: str | None = None
    baseline_version: int | None = None
    current_snapshot_id: str
    current_version: int
    # {section_slug: {"old": str, "new": str}} — only sections whose content
    # actually differs. An empty dict means the session made no blueprint
    # changes (review still useful for pending suggestions, but the diff
    # column collapses).
    sections: dict[str, dict[str, str]] = {}
    pending_suggestions: int = 0


class PublicBlueprintResponse(BaseModel):
    """Read-only payload for the public /share/blueprint/{token} view."""

    iteration_label: str
    iteration_number: int
    iteration_status: str
    version_number: int
    content: dict
    section_sources: dict | None = None
    bullet_sources: dict | None = None
    updated_at: datetime


class BlueprintIterationUpdate(BaseModel):
    label: str | None = None
    display_name: str | None = None
    iteration_type: str | None = None


# ─── Blueprint Suggestions ──────────────────────────────────────────────────


class SuggestionCreate(BaseModel):
    """Agent-side payload for creating a pending suggestion."""

    section: str
    content: str
    source_message_ids: list[str] | None = None
    # When set, names the existing bullet (verbatim) the new fact replaces.
    # Used to surface contradictions in the suggestions UI.
    supersedes_bullet: str | None = None


class SuggestionAccept(BaseModel):
    """User-side payload when accepting a suggestion (optional inline edit)."""

    edited_content: str | None = None
    # When True and the suggestion has a supersedes_bullet, strip that bullet
    # from the section before merging the new content. Default False keeps
    # both (current append-only behaviour) for suggestions without a flagged
    # conflict.
    replace: bool = False


class SuggestionBulkAccept(BaseModel):
    """User-side payload to accept all pending suggestions in one section."""

    section: str
    session_id: str | None = None


class SuggestionRead(BaseModel):
    id: str
    project_id: str
    session_id: str | None = None
    section: str
    content: str
    edited_content: str | None = None
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None
    source_message_ids: list[str] | None = None
    supersedes_bullet: str | None = None

    model_config = {"from_attributes": True}
