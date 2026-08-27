"""Per-org AI provider configuration.

Stores which AI provider an organization uses (platform-hosted, BYOK, Bedrock,
or self-hosted) and the credentials/config for that provider.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class OrgAIConfig(Base, TimestampMixin):
    __tablename__ = "org_ai_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # Provider type: "platform" | "byok" | "bedrock" | "self_hosted"
    provider: Mapped[str] = mapped_column(String(50), default="platform", nullable=False)

    # BYOK fields (only when provider="byok")
    byok_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)  # anthropic|openai|google
    byok_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)  # AES-256-GCM encrypted
    # Override for `task in ("default", "capable")`. Null → fall back to the
    # hardcoded provider tier dict in services/ai_provider.py.
    byok_default_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Override for `task="fast"`. Null → falls back to byok_default_model, then
    # to the hardcoded fast tier.
    byok_fast_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # AWS Bedrock fields (only when provider="bedrock")
    bedrock_role_arn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bedrock_region: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bedrock_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bedrock_fast_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Self-hosted fields (only when provider="self_hosted")
    self_hosted_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    self_hosted_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    self_hosted_fast_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Per-task model overrides for the generation pipeline. Null → use the
    # role's default model from services/ai_provider.py. These let an org pick
    # which model powers each heavy generation task without touching env vars:
    #   flow_model       → "flow" role  (user-flow diagrams)
    #   arch_model       → "arch" role  (cloud architecture diagrams)
    #   wireframe_model  → "wireframe" role (UI / mockup hero pass — generator)
    #   wireframe_critic_model → "wireframe_critic" role (Opus critic in the
    #                            hero refinement loop)
    flow_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    arch_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wireframe_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wireframe_critic_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Spend caps. Both nullable — when unset, no warning/blocking. The hard
    # limit is enforced at the AIClient edge (raises HardSpendLimitError);
    # the soft limit drives 80% / 95% banner warnings + email at 80% / 100%.
    monthly_spend_soft_limit_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    monthly_spend_hard_limit_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Falls back to Organization.billing_email when unset.
    spend_alert_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationship
    organization = relationship("Organization", backref="ai_config", uselist=False)


class OrgSpendAlertSent(Base):
    """Dedup table for spend-threshold email alerts.

    One row per (org, year_month, threshold) means the email for that
    threshold has already been delivered for that month. The spend tracker
    consults this before sending so threshold flapping doesn't spam billing.
    """

    __tablename__ = "org_spend_alerts_sent"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)  # "2026-05"
    threshold: Mapped[int] = mapped_column(nullable=False)  # 80 or 100
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("uq_org_spend_alerts_sent", "org_id", "year_month", "threshold", unique=True),
    )
