from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class HarnessConfig(TimestampMixin, Base):
    __tablename__ = "harness_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), unique=True, nullable=False)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"))
    repo_name: Mapped[str | None] = mapped_column(String(255))
    repo_url: Mapped[str | None] = mapped_column(String(500))
    repo_provider: Mapped[str] = mapped_column(String(20), default="github")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/generating/complete/failed
    generation_log: Mapped[dict | None] = mapped_column(JSON)
    template_overrides: Mapped[dict] = mapped_column(JSON, default=dict)
