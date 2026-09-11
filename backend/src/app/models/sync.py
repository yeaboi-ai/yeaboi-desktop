from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

SYNC_STATES = ("synced", "local_dirty", "remote_dirty", "conflict", "error", "pending")


class CardExternalLink(TimestampMixin, Base):
    """Pointer from a local Card to its mirror in an external tracker (Jira / ADO).

    One row per (card, provider). version_token holds ADO System.Rev or Jira versionId
    for optimistic-concurrency on outbound updates.
    """

    __tablename__ = "card_external_links"
    __table_args__ = (
        UniqueConstraint("card_id", "provider", name="uq_card_external_links_card_provider"),
        Index("ix_card_external_links_provider_external_id", "provider", "external_id"),
        Index("ix_card_external_links_integration_state", "integration_id", "sync_state"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False, index=True
    )
    integration_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("org_integrations.id", ondelete="CASCADE"), nullable=False
    )

    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # "jira" | "azure_devops"
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    external_key: Mapped[str | None] = mapped_column(String(64))
    external_url: Mapped[str | None] = mapped_column(String(500))

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_local_change_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_remote_change_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sync_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    version_token: Mapped[str | None] = mapped_column(String(64))


class IntegrationProjectMapping(TimestampMixin, Base):
    """Per-project configuration mapping a local Project to an external project.

    field_mappings holds priority levels, story-points custom field id, label strategy,
    assignee strategy, etc. — all the per-tenant translation knobs we don't want to bake
    into the translator code.
    """

    __tablename__ = "integration_project_mappings"
    __table_args__ = (
        UniqueConstraint(
            "integration_id", "internal_session_id", name="uq_integration_session_mappings_integration_session"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    integration_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("org_integrations.id", ondelete="CASCADE"), nullable=False
    )
    internal_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )

    external_project_key: Mapped[str] = mapped_column(String(120), nullable=False)
    external_project_id: Mapped[str | None] = mapped_column(String(64))
    default_issue_type: Mapped[str] = mapped_column(String(40), nullable=False, default="Task", server_default="Task")

    field_mappings: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    sync_direction: Mapped[str] = mapped_column(
        String(16), nullable=False, default="bidirectional", server_default="bidirectional"
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    webhook_secret_encrypted: Mapped[str | None] = mapped_column(Text)
    webhook_external_id: Mapped[str | None] = mapped_column(String(120))


class SyncEvent(TimestampMixin, Base):
    """Audit log of sync operations — powers the per-card sync timeline and the
    integration-detail "Webhook health" tab. Lightweight, append-only.
    """

    __tablename__ = "sync_events"
    __table_args__ = (Index("ix_sync_events_card_created", "card_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    card_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("cards.id", ondelete="CASCADE"))
    link_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("card_external_links.id", ondelete="CASCADE")
    )

    direction: Mapped[str] = mapped_column(String(8), nullable=False)  # "out" | "in"
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # create/update/comment/attach/conflict/error
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # ok/error/skipped
    request_id: Mapped[str | None] = mapped_column(String(60))
    payload: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
