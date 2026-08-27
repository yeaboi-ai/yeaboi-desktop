"""Repo conventions analysis job — backs the wizard's ``follow_practices`` style.

One row per project (latest-wins). Cached for 7 days; re-analysed on the next
follow_practices generation if older. Mirrors :class:`TaskGenerationJob` so the
status / error / timing fields read consistently.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class RepoAnalysisJob(TimestampMixin, Base):
    __tablename__ = "repo_analysis_jobs"
    __table_args__ = (
        # We look these up by (project_id, status, completed_at) when checking
        # TTL — the index keeps that path cheap even with many historic rows.
        Index("ix_repo_analysis_jobs_project_status", "project_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    # 'pending' | 'running' | 'complete' | 'failed'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # Repo introspected at job time — stored so we can detect repo_url changes
    # invalidate the cached profile even if the row is still inside its TTL.
    repo_full_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    # The extracted conventions profile (see repo_conventions_analyzer.py for
    # the schema). Populated only on `status == 'complete'`.
    profile_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
