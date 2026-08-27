"""add_depends_on_to_cards

Revision ID: fd2f094095e7
Revises: 0b7c23bf964c
Create Date: 2026-03-18 22:35:41.231621

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd2f094095e7"
down_revision: str | Sequence[str] | None = "0b7c23bf964c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("cards", sa.Column("depends_on", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("cards", "depends_on")
