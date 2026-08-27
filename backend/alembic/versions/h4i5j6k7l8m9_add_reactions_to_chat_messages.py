"""add reactions to chat_messages

Revision ID: h4i5j6k7l8m9
Revises: d8e1c3f5a7b9
Create Date: 2026-05-09 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h4i5j6k7l8m9"
down_revision: str | Sequence[str] | None = "d8e1c3f5a7b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("chat_messages", sa.Column("reactions", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("chat_messages", "reactions")
