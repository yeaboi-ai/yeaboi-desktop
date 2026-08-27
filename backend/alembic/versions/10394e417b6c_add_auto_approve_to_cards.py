"""add_auto_approve_to_cards

Revision ID: 10394e417b6c
Revises: 21d0d8c9c869
Create Date: 2026-03-20 15:09:05.843337

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "10394e417b6c"
down_revision: str | Sequence[str] | None = "21d0d8c9c869"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("cards", sa.Column("auto_approve", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("cards", "auto_approve")
