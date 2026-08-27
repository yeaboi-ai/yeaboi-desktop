"""add theme tables

Revision ID: 22fd050bba80
Revises: cc3d4e5f6a7b
Create Date: 2026-05-09 17:02:40.323285

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "22fd050bba80"
down_revision: str | Sequence[str] | None = "cc3d4e5f6a7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create theme tables: org_themes, user_theme_preferences, theme_presets."""
    op.create_table(
        "org_themes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("theme_id", sa.String(length=64), nullable=False),
        sa.Column("auto_light_dark", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id"),
    )

    op.create_table(
        "theme_presets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("scope", sa.String(length=10), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        sa.Column("org_id", sa.String(length=36), nullable=True),
        sa.Column("base_preset", sa.String(length=64), nullable=True),
        sa.Column("color_scheme", sa.String(length=10), nullable=False),
        sa.Column("tokens", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(scope = 'user' AND owner_user_id IS NOT NULL AND org_id IS NULL) OR "
            "(scope = 'org' AND org_id IS NOT NULL AND owner_user_id IS NULL)",
            name="ck_theme_presets_scope_ownership",
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_theme_presets_org_scope", "theme_presets", ["org_id", "scope"], unique=False)
    op.create_index("ix_theme_presets_owner_user_id", "theme_presets", ["owner_user_id"], unique=False)

    op.create_table(
        "user_theme_preferences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("theme_id", sa.String(length=64), nullable=True),
        sa.Column("auto_light_id", sa.String(length=64), nullable=True),
        sa.Column("auto_dark_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    """Drop theme tables."""
    op.drop_table("user_theme_preferences")
    op.drop_index("ix_theme_presets_owner_user_id", table_name="theme_presets")
    op.drop_index("ix_theme_presets_org_scope", table_name="theme_presets")
    op.drop_table("theme_presets")
    op.drop_table("org_themes")
