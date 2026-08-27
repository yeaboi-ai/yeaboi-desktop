"""add wireframe_critic_model to org_ai_config

Revision ID: b1c2d3e4f5a6
Revises: a9f3c1e7b2d4
Create Date: 2026-05-26

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a9f3c1e7b2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "org_ai_config",
        sa.Column("wireframe_critic_model", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("org_ai_config", "wireframe_critic_model")
