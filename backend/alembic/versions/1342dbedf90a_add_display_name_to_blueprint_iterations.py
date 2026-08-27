"""add_display_name_to_blueprint_iterations

Revision ID: 1342dbedf90a
Revises: 78444d5c227d
Create Date: 2026-04-05 06:57:00.519488

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1342dbedf90a"
down_revision: str | Sequence[str] | None = "78444d5c227d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add display_name column to blueprint_iterations for user-facing release names."""
    op.add_column("blueprint_iterations", sa.Column("display_name", sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Remove display_name column."""
    op.drop_column("blueprint_iterations", "display_name")
