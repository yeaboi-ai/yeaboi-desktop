"""Add canvas_elements to sessions

Revision ID: c3d4e5f6g7h9
Revises: b2c3d4e5f6g8
Create Date: 2026-03-29 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6g7h9"
down_revision: str | None = "b2c3d4e5f6g8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("canvas_elements", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "canvas_elements")
