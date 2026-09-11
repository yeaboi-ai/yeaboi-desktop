from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class SessionOutput(TimestampMixin, Base):
    """One row per (project, output_type). Regeneration overwrites the row in place."""

    __tablename__ = "session_outputs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    output_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # 'code_scaffold' | 'design_bundle' | 'terraform_stack' | 'decision_doc'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_generated")
    # 'not_generated' | 'generating' | 'ready' | 'failed'
    payload: Mapped[dict | None] = mapped_column(JSON)  # type-specific input (e.g., repo_name)
    artifacts: Mapped[dict | None] = mapped_column(JSON)  # type-specific result (e.g., repo_url)
    error: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (UniqueConstraint("session_id", "output_type", name="uq_session_outputs_type"),)
