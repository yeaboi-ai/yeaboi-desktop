"""add removed_bullets to blueprint_iterations

Tracks bullets the user explicitly deleted per section so the voice agent's
merge doesn't re-add them on the next extraction.

Revision ID: e1f2c3a4b5d6
Revises: 67183722e2b6
Create Date: 2026-05-03 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e1f2c3a4b5d6"
down_revision: str | Sequence[str] | None = "67183722e2b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("blueprint_iterations", sa.Column("removed_bullets", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("blueprint_iterations", "removed_bullets")
