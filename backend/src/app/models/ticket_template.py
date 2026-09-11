from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class TicketTemplate(TimestampMixin, Base):
    """User-customisable template for AI-generated tickets.

    Lives at the org level (session_id null) or scoped to a project. Composes into the
    task_generator prompt via prompt_fragment, and shapes the resulting card via
    default_priority / default_labels / default_story_points / acceptance_criteria_template
    / field_schema (custom fields rendered on the card).
    """

    __tablename__ = "ticket_templates"
    __table_args__ = (
        UniqueConstraint("org_id", "session_id", "slug", "deleted_at", name="uq_ticket_templates_scope_slug"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"), index=True)

    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(30), default="zap", server_default="zap")

    default_priority: Mapped[str | None] = mapped_column(String(20))
    default_story_points: Mapped[int | None] = mapped_column(Integer)
    default_labels: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    # Prompt fragment composed into the task_generator GENERATION_PROMPT.
    prompt_fragment: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    # Custom fields only (back-compat view). The authoritative ordered list of
    # ALL fields (built-in + custom) lives in ``field_layout`` below — the
    # router keeps the two in sync.
    field_schema: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    # Unified ordered list of every field rendered on the ticket detail panel.
    # Each entry: {key, label, type, source: "builtin"|"custom", placement: "main"|"sidebar"|"header",
    # visible, required, options?}. Lets the editor rename, reorder, hide built-ins
    # without losing their semantic mapping to Card columns. See
    # ``services/ticket_template_service.default_field_layout`` for the seed shape.
    field_layout: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    acceptance_criteria_template: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    # {"sections": ["architecture", "api_integrations"], "session_types": ["new_feature"]}
    applicability: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")

    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Bumped on PATCH of prompt_fragment / field_schema. Cards stamp template_version
    # at create-time so old cards don't change shape when the template evolves.
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
