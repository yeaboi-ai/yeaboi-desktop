from datetime import datetime

from pydantic import BaseModel, Field

from .session_workspace import MAX_REFERENCES, SessionReference


class SessionCreate(BaseModel):
    initial_idea: str | None = None
    title: str | None = None
    persona: str | None = None
    iteration_type: str | None = None
    focus_sections: list[str] | None = None
    # Coverage-aware launcher payload. Shape:
    # {mode: 'gaps' | 'deep_dive' | 'resume' | 'free_form',
    #  sections: list[str], bullet_ids: list[str]}.
    # When provided alongside focus_sections, focus_sections wins (explicit).
    # When provided alone, the create handler derives focus_sections from
    # focus_target.sections so the facilitator's existing scoping path
    # keeps working without changes.
    focus_target: dict | None = None
    # Per-persona question budget. "fast" caps each persona at 3 questions
    # before the persona-switch chip fires, "balanced" at 5, "deep" at 8.
    # Anything else is normalised to "balanced" by services.pace.
    pace: str | None = None
    # User's comfort level with technical terms. "non_technical" makes the AI
    # explain jargon inline; "expert" makes it terse and skip definitions;
    # "comfortable" is the default. Anything else is normalised to
    # "comfortable" by services.facilitator.normalise_technical_comfort.
    technical_comfort: str | None = None


class SessionUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    ai_config: dict | None = None
    # ── The workspace half ──
    name: str | None = None
    description: str | None = None
    repo_url: str | None = None
    # Granularity + modifier slugs are validated by the router against the org's
    # editable rows (so admin-created customs are first-class), not a static enum.
    default_generation_style: str | None = None
    default_modifiers: list[str] | None = Field(default=None)
    # Replaces the whole list; deduped on (source, subject) by the router.
    references: list[SessionReference] | None = Field(default=None, max_length=MAX_REFERENCES)


class ParticipantResponse(BaseModel):
    id: str
    user_id: str
    role: str
    user_name: str | None = None
    user_email: str | None = None
    # NULL until the participant decides; True/False once they accept/decline.
    recording_consent: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    content: str
    # Optional: frontend sends the current canvas wirescreens with the message
    # so the backend can detect "rework existing" intent even when the DB row
    # hasn't caught up to the React state. Used as fallback for the
    # per-screen pipeline's existing_screens_state.
    current_wireframe: dict | None = None


class ChatMessageUpdate(BaseModel):
    content: str | None = None
    # When true, the message is replaced with a [redacted] placeholder.
    # `content` is ignored. `original_content` is preserved as usual so the
    # redaction is reversible by an admin via direct DB access.
    redact: bool = False


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    user_id: str | None
    content: str
    message_type: str
    speaker_name: str | None = None
    audio_url: str | None = None
    attachments: list[dict] | None = None
    original_content: str | None = None
    is_enhanced: bool = False
    reactions: dict[str, list[str]] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageReactionRequest(BaseModel):
    emoji: str


class MessageReactionResponse(BaseModel):
    message_id: str
    reactions: dict[str, list[str]]


class AIEditElementRequest(BaseModel):
    node_id: str
    node_type: str
    node_data: dict
    instruction: str
    diagram_context: dict | None = None


class SessionResponse(BaseModel):
    id: str
    org_id: str | None = None
    status: str
    title: str | None
    initial_idea: str | None
    # ── The workspace half, absorbed from the project a session used to live in ──
    name: str | None = None
    description: str | None = None
    repo_url: str | None = None
    owner_id: str | None = None
    team_id: str | None = None
    is_demo: bool = False
    key: str | None = None
    is_own_team: bool = False
    default_generation_style: str | None = None
    default_modifiers: list[str] = Field(default_factory=list)
    references: list[SessionReference] = Field(default_factory=list)
    # Only the detail GET fills this; None elsewhere means "not loaded", not "none".
    attachments: list[dict] | None = None
    continued_from_id: str | None = None
    yeaboi_session_id: str | None = None
    join_code: str
    ai_config: dict
    iteration_id: str | None = None
    canvas_elements: dict | None = None
    focus_sections: list[str] | None = None
    focus_target: dict | None = None
    blueprint_review_status: str = "none"
    blueprint_review_completed_at: datetime | None = None
    participants: list[ParticipantResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BlueprintReviewComplete(BaseModel):
    """Payload for POST /api/sessions/{id}/blueprint-review/complete."""

    # When True, mark the review as completed even if pending suggestions
    # remain. The UI surfaces this as an explicit "skip remaining" path so
    # users aren't blocked from moving on if they want to defer.
    skip_remaining: bool = False


class ExplainTermRequest(BaseModel):
    """Ad-hoc lookup for technical terms not in the frontend static glossary.

    Used by the chat term-popover fallback so unknown words are still
    clickable. The endpoint replies with the same shape as a static
    GlossaryEntry; the frontend renders it identically."""

    # The word/phrase the user clicked. Free-form so it can include short
    # multi-word terms ("circuit breaker") or punctuated forms.
    term: str
    # Optional surrounding sentence to ground "what the AI meant" in the
    # current message context. When omitted, the response uses a generic hint.
    context: str | None = None
