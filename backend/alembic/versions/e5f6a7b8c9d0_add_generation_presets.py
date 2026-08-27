"""add generation_presets table for org-level preset definitions

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-21 14:30:00.000000

Org-level preset bundles for the wizard's PresetPickerGate. Each preset is
a (granularity, modifiers) pair plus presentational metadata (label, blurb,
icon, sort_order). Admins edit them in the Studio's Tickets → Presets page;
the wizard and board-settings page fetch them on mount.

System presets get seeded lazily via ``preset_service.ensure_org_generation_presets``
on first GET — no data migration needed in this file.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generation_presets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "org_id",
            sa.String(length=36),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("blurb", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=40), nullable=False, server_default="Layers"),
        sa.Column(
            "granularity",
            sa.String(length=32),
            nullable=False,
            server_default="balanced",
        ),
        sa.Column("modifiers", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "org_id", "slug", "deleted_at", name="uq_generation_presets_org_slug"
        ),
    )
    op.create_index(
        "ix_generation_presets_org",
        "generation_presets",
        ["org_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_generation_presets_org", table_name="generation_presets")
    op.drop_table("generation_presets")
