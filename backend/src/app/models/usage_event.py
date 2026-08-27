from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

# Allowed providers — billing-relevant external services we instrument.
USAGE_PROVIDERS = (
    "anthropic",
    "openai",
    "elevenlabs",
    "cartesia",
    "deepgram",
    "livekit",
    "resend",
    "github",
)

# Allowed operations — semantic kind of work, billed differently per provider.
USAGE_OPERATIONS = (
    "chat",
    "embedding",
    "tts",
    "stt",
    "egress",
    "room_minutes",
    "email_send",
    "api_call",
)

# Provenance of a usage_event row. `backfill` rows participate in idempotency
# (see partial unique index in the migration); other sources never dedup.
USAGE_SOURCES = ("api", "agent_worker", "webhook", "backfill", "subscription")


class UsageEvent(Base):
    """One billable unit of work against an external provider.

    Append-only ledger. `units` is intentionally JSON because each
    (provider, operation) records different shapes (tokens for LLMs,
    characters for TTS, seconds for STT/egress, count for emails).
    `cost_usd` is computed at write time via `services.usage_costs.compute_cost`
    so historical reports stay stable when pricing changes.
    """

    __tablename__ = "usage_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    units: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=Decimal("0"))
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="api")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True, default=None)

    __table_args__ = (
        Index("ix_usage_events_org_occurred", "org_id", "occurred_at"),
        Index("ix_usage_events_project_occurred", "project_id", "occurred_at"),
        Index("ix_usage_events_session", "session_id"),
        Index("ix_usage_events_provider_occurred", "provider", "occurred_at"),
    )


class PricingOverride(TimestampMixin, Base):
    """Per-org or global pricing override. Optional — when no row matches a
    (provider, operation, model) lookup, the static `_PRICING` table in
    `services.usage_costs` is used.

    `org_id IS NULL` means a global override (e.g. we updated a public price
    list mid-month and don't want to redeploy). A row with `org_id` set takes
    precedence over global rows for that org.
    """

    __tablename__ = "pricing_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Unit codes match PricingRule.unit in usage_costs.py — keep the two in sync.
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    price_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8), nullable=False)
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (Index("ix_pricing_overrides_lookup", "provider", "operation", "model", "org_id"),)
