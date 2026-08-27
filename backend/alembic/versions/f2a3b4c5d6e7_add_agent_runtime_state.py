"""add agent_runtime_state to sessions

Persists voice agent in-process state (speaker map, used personas, posted
text dedup, last-extracted index) so a worker restart doesn't reset them.

Revision ID: f2a3b4c5d6e7
Revises: e1f2c3a4b5d6
Create Date: 2026-05-03 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2c3a4b5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("agent_runtime_state", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "agent_runtime_state")
