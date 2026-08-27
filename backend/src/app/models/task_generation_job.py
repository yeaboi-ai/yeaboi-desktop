from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class TaskGenerationJob(TimestampMixin, Base):
    __tablename__ = "task_generation_jobs"
    __table_args__ = (
        Index("ix_task_generation_jobs_session_status", "session_id", "status"),
        Index("ix_task_generation_jobs_project_status", "project_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    # 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    current_wave: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    waves_complete: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    partial_tasks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    templates_payload: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
    feedback_context: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    # Wizard-selected ticket granularity (one of GRANULARITY_SLUGS). Column is
    # named ``style`` for backwards compat with the previous single-axis API;
    # semantically it's now the granularity choice. Frozen at dispatch so a
    # mid-run change to the project default can't corrupt an in-flight loop.
    style: Mapped[str] = mapped_column(String(32), nullable=False, default="balanced", server_default="balanced")
    # 0+ functional modifiers from MODIFIER_SLUGS (vertical_slices, story_driven,
    # spike_first, wave_optimised, follow_practices). Stack on top of granularity
    # to compose the prompt's style block. Empty list = no modifiers, today's
    # behaviour.
    modifiers: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    # Snapshot of the repo-conventions profile used for this job (only set when
    # `follow_practices` is in modifiers). Frozen for the same reason as style.
    repo_profile_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
