from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class BlueprintIteration(TimestampMixin, Base):
    """Groups blueprint snapshots into semantic product versions (v1, v2, etc.)."""

    __tablename__ = "blueprint_iterations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"))
    iteration_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    label: Mapped[str] = mapped_column(String(50), default="v1")
    display_name: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="planning")  # planning | ready | locked
    locked_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    forked_from_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("blueprint_iterations.id"))
    iteration_type: Mapped[str | None] = mapped_column(String(30))
    parent_out_of_scope: Mapped[str | None] = mapped_column(Text)
    # {section_slug: [normalized_bullet, ...]} — bullets the user explicitly
    # deleted. The agent's merge skips these so it doesn't keep re-adding
    # content the user removed.
    removed_bullets: Mapped[dict | None] = mapped_column(JSON, default=None)
    # Issued via POST /blueprint-iterations/{id}/share. Read-only public view
    # at /share/blueprint/{token} is gated on share_enabled — revocation flips
    # the flag rather than dropping the token so links 410 instead of 404.
    share_token: Mapped[str | None] = mapped_column(String(64), index=True, default=None)
    share_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # The yeaboi engine planning session that generated this iteration's plan.
    # A SessionStore id in the sidecar's own database — soft reference, no FK.
    # Re-generating overwrites it; the plan panel uses it for plan_get.
    yeaboi_session_id: Mapped[str | None] = mapped_column(String(64), default=None)
    plan_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Snapshot the plan was generated from — soft reference (no FK) so a
    # pruned snapshot can't orphan the row. Newer snapshots than this mean
    # the blueprint changed since the plan: the UI shows a staleness banner.
    plan_source_snapshot_id: Mapped[str | None] = mapped_column(String(36), default=None)


class BlueprintSnapshot(TimestampMixin, Base):
    __tablename__ = "blueprint_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"))
    iteration_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("blueprint_iterations.id"))
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), default="ai")
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="SET NULL"))
    section_sources: Mapped[dict | None] = mapped_column(JSON, default=None)
    # {section_slug: {normalized_bullet: source}} — per-bullet provenance.
    # source is one of "user_stated" | "user_confirmed" | "ai_inferred".
    # Section-level ``section_sources`` is kept for back-compat; this is the
    # finer-grained view used by the blueprint document UI.
    bullet_sources: Mapped[dict | None] = mapped_column(JSON, default=None)
    diff_from_previous: Mapped[dict | None] = mapped_column(JSON)


class BlueprintSuggestion(TimestampMixin, Base):
    """Pending agent-extracted blueprint additions awaiting user review.

    The voice agent writes here instead of mutating the blueprint directly
    so users can accept/edit/reject AI-extracted facts before they land.
    """

    __tablename__ = "blueprint_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="SET NULL"))
    section: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    edited_content: Mapped[str | None] = mapped_column(Text, default=None)
    # 'pending' | 'accepted' | 'rejected'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), default=None)
    source_message_ids: Mapped[list | None] = mapped_column(JSON, default=None)
    # Existing bullet (verbatim text from the section) that this suggestion
    # contradicts or updates. Set by the extraction LLM when it detects a
    # conflict; the accept service uses it to support a 'replace' mode that
    # strips the superseded bullet before merging the new one.
    supersedes_bullet: Mapped[str | None] = mapped_column(Text, default=None)
