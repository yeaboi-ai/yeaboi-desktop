"""Theme system models.

Three tables drive the theming feature:

* ``org_themes``: one row per org. Stores the org's default theme — either a
  built-in preset (theme_id like ``preset:dark``) or a reference to a custom
  preset that's been shared org-wide.
* ``user_theme_preferences``: one row per user. Captures whether the user
  follows the org default, has chosen a specific theme, or is in
  follow-system mode (in which case ``auto_light_id`` / ``auto_dark_id``
  drive the choice based on ``prefers-color-scheme``).
* ``theme_presets``: custom themes. Scope is either ``user`` (owned by a
  single user) or ``org`` (org admin shared with the whole org so it can be
  set as the org default).
"""

from __future__ import annotations

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class OrgTheme(TimestampMixin, Base):
    __tablename__ = "org_themes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # Either a built-in preset id (e.g. "preset:dark") or a "custom:<uuid>"
    # pointing at a row in ``theme_presets`` with scope='org'.
    theme_id: Mapped[str] = mapped_column(String(64), nullable=False, default="preset:dark")
    auto_light_dark: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class UserThemePreference(TimestampMixin, Base):
    __tablename__ = "user_theme_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # 'explicit' | 'org_default' | 'system'
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="org_default")
    # When mode='explicit': the chosen theme id (built-in or custom).
    theme_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # When mode='system': separate ids for light and dark schemes.
    auto_light_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auto_dark_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ThemePreset(TimestampMixin, Base):
    __tablename__ = "theme_presets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 'user' | 'org'
    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    org_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Optional: which built-in preset this theme was forked from.
    base_preset: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 'light' | 'dark' — drives the data-color-scheme attribute.
    color_scheme: Mapped[str] = mapped_column(String(10), nullable=False, default="dark")
    tokens: Mapped[dict] = mapped_column(JSON, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    __table_args__ = (
        # Exactly one of owner_user_id / org_id must be set, matching scope.
        CheckConstraint(
            "(scope = 'user' AND owner_user_id IS NOT NULL AND org_id IS NULL) OR "
            "(scope = 'org' AND org_id IS NOT NULL AND owner_user_id IS NULL)",
            name="ck_theme_presets_scope_ownership",
        ),
        Index("ix_theme_presets_owner_user_id", "owner_user_id"),
        Index("ix_theme_presets_org_scope", "org_id", "scope"),
    )
