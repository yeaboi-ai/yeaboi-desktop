"""add harness configs

Revision ID: c1a2b3d4e5f6
Revises: 6683f4193c84
Create Date: 2026-03-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1a2b3d4e5f6"
down_revision: str | None = "6683f4193c84"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "harness_configs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("repo_name", sa.String(255), nullable=True),
        sa.Column("repo_url", sa.String(500), nullable=True),
        sa.Column("repo_provider", sa.String(20), nullable=False, server_default="github"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("generation_log", sa.JSON(), nullable=True),
        sa.Column("template_overrides", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id"),
    )


def downgrade() -> None:
    op.drop_table("harness_configs")
