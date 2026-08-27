"""add generation_granularities and generation_modifiers tables

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-21 15:00:00.000000

Two org-level CRUD resources that lift the previously-hardcoded granularity
choices (3) and modifier choices (16) into editable rows. Admins can now
edit any system option's prompt_fragment, add custom options, and reorder
the menu. Seeding is lazy on first GET — no data migration here.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generation_granularities",
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
        sa.Column("prompt_fragment", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "slug", "deleted_at", name="uq_generation_granularities_org_slug"),
    )
    op.create_index("ix_generation_granularities_org", "generation_granularities", ["org_id"])

    op.create_table(
        "generation_modifiers",
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
        sa.Column("category", sa.String(length=20), nullable=False, server_default="shape"),
        sa.Column("prompt_fragment", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "slug", "deleted_at", name="uq_generation_modifiers_org_slug"),
    )
    op.create_index("ix_generation_modifiers_org", "generation_modifiers", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_generation_modifiers_org", table_name="generation_modifiers")
    op.drop_table("generation_modifiers")
    op.drop_index("ix_generation_granularities_org", table_name="generation_granularities")
    op.drop_table("generation_granularities")
