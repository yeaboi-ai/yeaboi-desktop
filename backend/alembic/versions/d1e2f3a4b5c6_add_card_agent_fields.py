"""add card agent fields

Revision ID: d1e2f3a4b5c6
Revises: c1a2b3d4e5f6
Create Date: 2026-03-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c1a2b3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cards", sa.Column("agent_status", sa.String(20), nullable=True))
    op.add_column("cards", sa.Column("agent_pr_url", sa.String(500), nullable=True))
    op.add_column("cards", sa.Column("agent_branch", sa.String(255), nullable=True))
    op.add_column("cards", sa.Column("agent_log", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("cards", "agent_log")
    op.drop_column("cards", "agent_branch")
    op.drop_column("cards", "agent_pr_url")
    op.drop_column("cards", "agent_status")
