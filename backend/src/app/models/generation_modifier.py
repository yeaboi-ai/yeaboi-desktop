"""Org-level modifier option — the multi-select chips in the wizard's Approach pane.

Same shape as :class:`GenerationGranularity` plus a ``category`` field that
slots the modifier into one of the 4 hardcoded buckets (shape / quality /
risk / methodology). Categories themselves are NOT user-editable in this
iteration — keeping them fixed avoids a third level of customisation that
would clutter the editor.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class GenerationModifier(TimestampMixin, Base):
    __tablename__ = "generation_modifiers"
    __table_args__ = (
        # Partial unique index — see GenerationPreset for the rationale.
        Index(
            "uq_generation_modifiers_org_slug_active",
            "org_id",
            "slug",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_generation_modifiers_org", "org_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )

    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    blurb: Mapped[str | None] = mapped_column(Text)
    # One of: shape | quality | risk | methodology. Determines which sub-grid
    # the modifier appears under in the wizard's Approach pane.
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="shape", server_default="shape")
    # The text the LLM sees when this modifier is selected. Stacks with the
    # granularity fragment + any other selected modifiers.
    prompt_fragment: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
