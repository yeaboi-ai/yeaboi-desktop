"""Org-level generation preset — the named bundle the wizard picker shows.

A preset is a (granularity, modifiers) pair plus presentational metadata
(label, blurb, icon, sort order). Mirrors :class:`TicketTemplate`'s
org-seeded-with-system-defaults shape so the Studio CRUD UX can use the
same patterns.

Edited from the Studio's "Tickets → Presets" page. Consumed by the wizard
gate (``PresetPickerGate``) and the board-settings default picker — both
fetch the org's presets on mount and render them instead of the hardcoded
client-side defaults that shipped in iteration 4.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class GenerationPreset(TimestampMixin, Base):
    __tablename__ = "generation_presets"
    __table_args__ = (
        # Partial unique index — soft-deleted rows can re-share a slug with a
        # fresh active row. A plain 3-col UniqueConstraint with deleted_at as
        # a member doesn't enforce active-row uniqueness in Postgres (NULL !=
        # NULL). See migration g8h9i0j1k2l3.
        Index(
            "uq_generation_presets_org_slug_active",
            "org_id",
            "slug",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_generation_presets_org", "org_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )

    # Stable identifier used by clients to match presets across re-fetches and
    # to look up the built-in spec when resetting. Auto-generated from `label`
    # if missing on POST. Lowercase + underscores; never edited after create.
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    blurb: Mapped[str | None] = mapped_column(Text)
    # Stored as a lucide-react icon name string (e.g. "Flag", "ShieldCheck").
    # Validated against ALLOWED_ICONS in the router so an admin can't smuggle
    # an arbitrary string the frontend can't render.
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="Layers", server_default="Layers")

    # The bundle: one granularity + 0+ modifiers. Slug values match the
    # GRANULARITY_SLUGS / MODIFIER_SLUGS enums in
    # services/generation_styles.py.
    granularity: Mapped[str] = mapped_column(String(32), nullable=False, default="balanced", server_default="balanced")
    modifiers: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Seeded presets are flagged so the editor can show a "system" badge,
    # hide the delete button, and expose a "Reset to defaults" action. Edits
    # to system presets are still allowed — only slug + is_system are immutable.
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
