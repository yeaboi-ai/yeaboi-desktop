"""Org-level granularity option — the "Number of tickets" radio in the wizard.

Lives alongside :class:`GenerationModifier` and :class:`GenerationPreset` so
admins can edit / extend / reorder the granularity menu without a code deploy.
Each row carries the actual ``prompt_fragment`` text injected into the wave
prompt, so an admin defining a new granularity ("Epic-and-children") writes
the guidance the LLM sees.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class GenerationGranularity(TimestampMixin, Base):
    __tablename__ = "generation_granularities"
    __table_args__ = (
        # Partial unique index — see GenerationPreset for the rationale.
        Index(
            "uq_generation_granularities_org_slug_active",
            "org_id",
            "slug",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_generation_granularities_org", "org_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )

    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    blurb: Mapped[str | None] = mapped_column(Text)
    # The text the LLM actually sees when this granularity is selected. Spliced
    # into the wave prompt's STYLE GUIDANCE block by ``compose_style_block``.
    prompt_fragment: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
