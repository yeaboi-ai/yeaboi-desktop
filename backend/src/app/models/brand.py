"""Per-org branding: saved brand presets that admins can switch between.

Multiple rows per org are allowed; exactly one carries ``is_active=True``
at any moment (enforced in the service layer). The ``theme_id`` field
points at the theme that backs this brand (typically a ``custom:<uuid>``
org-shared preset created by the AI brand generator). When a brand is
activated, the app shell reads this row to swap the wordmark + logo, and
``OrgTheme.theme_id`` is updated to match.
"""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class OrgBrand(TimestampMixin, Base):
    __tablename__ = "org_brands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Admin-facing label of this saved brand (distinct from ``app_name``,
    # which is the wordmark members see in the sidebar). Examples:
    # "Acme default", "Acme dark variant", "Holiday rebrand 2026".
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="Brand")
    # Exactly one row per org should be active. Enforced in router code,
    # not via a partial-unique index — that's brittle across DB engines
    # and the read pattern is always "active for org" anyway.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    app_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tagline: Mapped[str | None] = mapped_column(String(200), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Original input — the website URL (or "upload://...") used to derive
    # this brand. Kept for re-analysis and audit.
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Mirrors the OrgTheme.theme_id this brand was generated alongside, so
    # the brand and its theme can be re-applied as a pair. Optional —
    # admins may save brand metadata without a generated theme.
    theme_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
