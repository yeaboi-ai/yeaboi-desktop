"""Integration models — per-org external service connections and scan history."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class OrgIntegration(TimestampMixin, Base):
    __tablename__ = "org_integrations"
    __table_args__ = (
        UniqueConstraint("org_id", "provider", name="uq_org_integration_provider"),
        Index("ix_org_integration_category", "org_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")

    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credentials: Mapped[str | None] = mapped_column(Text, nullable=True)
    scopes: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    metadata_json: Mapped[str | None] = mapped_column("metadata", Text, nullable=True)

    connected_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    scan_logs: Mapped[list["IntegrationScanLog"]] = relationship(
        "IntegrationScanLog", back_populates="integration", cascade="all, delete-orphan"
    )


class IntegrationScanLog(Base):
    __tablename__ = "integration_scan_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    integration_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("org_integrations.id", ondelete="CASCADE"), nullable=False
    )
    scan_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running", server_default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    resources_scanned: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    entries_created: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    entries_updated: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ai_calls_made: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ai_tokens_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details_json: Mapped[str | None] = mapped_column("details", Text, nullable=True)

    integration: Mapped["OrgIntegration"] = relationship("OrgIntegration", back_populates="scan_logs")
    items: Mapped[list["IntegrationScanItem"]] = relationship(
        "IntegrationScanItem", back_populates="scan_log", cascade="all, delete-orphan"
    )


class IntegrationScanItem(Base):
    __tablename__ = "integration_scan_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    scan_log_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("integration_scan_logs.id", ondelete="CASCADE"), nullable=False
    )
    resource_path: Mapped[str] = mapped_column(String(500), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    ai_model_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    directory_entry_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("directory_entries.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    scan_log: Mapped["IntegrationScanLog"] = relationship("IntegrationScanLog", back_populates="items")
