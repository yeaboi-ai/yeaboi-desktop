"""add session_id to cards

Revision ID: 78444d5c227d
Revises: 49fe92e24427
Create Date: 2026-04-05 06:26:28.056258

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "78444d5c227d"
down_revision: str | Sequence[str] | None = "49fe92e24427"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("cards", sa.Column("session_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_cards_session_id", "cards", "sessions", ["session_id"], ["id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_cards_session_id", "cards", type_="foreignkey")
    op.drop_column("cards", "session_id")
