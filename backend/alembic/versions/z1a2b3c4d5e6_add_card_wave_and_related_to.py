"""add wave and related_to columns to cards

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-05-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "z1a2b3c4d5e6"
down_revision: str | None = "y0z1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cards",
        sa.Column("related_to", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "cards",
        sa.Column("wave", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cards", "wave")
    op.drop_column("cards", "related_to")
