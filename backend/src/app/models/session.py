from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class Session(TimestampMixin, Base):
    __tablename__ = "sessions"

    __table_args__ = (UniqueConstraint("org_id", "key", name="uq_sessions_org_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="created")
    title: Mapped[str | None] = mapped_column(String(255))

    # ── What the session is, absorbed from the project it used to live in ──
    name: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    repo_url: Mapped[str | None] = mapped_column(String(500))
    owner_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("teams.id", use_alter=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Human-friendly key, e.g. "PROJ" — renders ticket ids like PROJ-123. Unique within org.
    key: Mapped[str | None] = mapped_column(String(10))
    # Per-session monotonic counter for ticket numbering. Bumped via UPDATE...RETURNING.
    card_counter: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    # Marker for the onboarding-seeded sample: hidden from plan-limit counts.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    # Wizard ticket-generation default. None == the global default at run time.
    default_generation_style: Mapped[str | None] = mapped_column(String(32), nullable=True)
    default_modifiers: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    # What the session points at: [{source, subject, label, url}]. Stored as
    # `reference_links` because `references` is a reserved word.
    references: Mapped[list] = mapped_column("reference_links", JSON, nullable=False, default=list, server_default="[]")
    # A follow-up opens from the session before it; the chain is what makes the
    # ledger read chronologically rather than as a folder tree.
    continued_from_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"))
    initial_idea: Mapped[str | None] = mapped_column(Text)
    join_code: Mapped[str] = mapped_column(String(12), unique=True, default=lambda: gen_uuid()[:8])
    ai_config: Mapped[dict] = mapped_column(JSON, default=lambda: {"assertiveness": "balanced", "muted": False})
    # use_alter: sessions and blueprint_iterations point at each other, so the
    # constraint is added after both tables exist rather than inline.
    iteration_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("blueprint_iterations.id", use_alter=True)
    )
    diagram_state: Mapped[dict | None] = mapped_column(JSON, default=None)
    canvas_elements: Mapped[list | None] = mapped_column(JSON, default=None)
    focus_sections: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    # Coverage-aware launcher payload. Shape:
    # {mode: 'gaps' | 'deep_dive' | 'resume' | 'free_form',
    #  sections: list[str], bullet_ids: list[str]}.
    # focus_sections is preserved as the canonical "which sections is this
    # session scoped to" view for back-compat; focus_target carries the
    # richer intent so the facilitator can deep-dive on specific bullets.
    focus_target: Mapped[dict | None] = mapped_column(JSON, default=None)
    # Voice agent in-process state checkpointed periodically so a worker
    # restart doesn't reset speaker diarization, persona-suggestion history,
    # or last-extracted-idx. Loaded on agent boot, written every ~30s and on
    # graceful shutdown.
    agent_runtime_state: Mapped[dict | None] = mapped_column(JSON, default=None)
    # W6.6.3 — final extraction pass at session-complete time. Shape:
    # {"decisions": [{"text": str, "ts": str}], "action_items": [...], "open_questions": [...]}.
    # `ts` is an ISO timestamp pointing back into the transcript so the recap
    # screen can scrub to the source.
    session_extraction: Mapped[dict | None] = mapped_column(JSON, default=None)
    # 'none' | 'pending' | 'completed' — drives the post-session "what changed"
    # review flow. Flipped to 'pending' the moment a BlueprintSuggestion lands
    # for this session, then to 'completed' when the user resolves the review
    # (or skips it explicitly).
    blueprint_review_status: Mapped[str] = mapped_column(
        String(20), default="none", nullable=False
    )
    blueprint_review_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    owner: Mapped[User] = relationship(back_populates="sessions")  # noqa: F821
    participants: Mapped[list[Participant]] = relationship(back_populates="session", cascade="all, delete-orphan")
    chat_messages: Mapped[list[ChatMessage]] = relationship(back_populates="session", cascade="all, delete-orphan")
    transcript_entries: Mapped[list[TranscriptEntry]] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan"
    )


class Participant(TimestampMixin, Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # Allowed values: "host" | "co_host" | "member" (W4.3.5 introduces co_host)
    role: Mapped[str] = mapped_column(String(20), default="member")
    # W5.7.4 — recording consent. NULL = not yet decided (prompt on join).
    recording_consent: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)

    session: Mapped[Session] = relationship(back_populates="participants")
    user: Mapped[User] = relationship()  # noqa: F821


class ChatMessage(TimestampMixin, Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), default="chat")
    speaker_name: Mapped[str | None] = mapped_column(String(255))
    audio_url: Mapped[str | None] = mapped_column(String(500), default=None)
    attachments: Mapped[list | None] = mapped_column(JSON, default=None)
    original_content: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    is_enhanced: Mapped[bool] = mapped_column(Boolean, default=False)
    # Map of emoji → list of user_ids that reacted. Toggle add/remove via
    # POST /api/sessions/{id}/messages/{msg_id}/reactions.
    reactions: Mapped[dict | None] = mapped_column(JSON, default=None)

    session: Mapped[Session] = relationship(back_populates="chat_messages")
    user: Mapped[User | None] = relationship()  # noqa: F821


class TranscriptEntry(TimestampMixin, Base):
    __tablename__ = "transcript_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    speaker_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    speaker_name: Mapped[str | None] = mapped_column(String(255))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    is_final: Mapped[bool] = mapped_column(default=True)

    session: Mapped[Session] = relationship(back_populates="transcript_entries")
