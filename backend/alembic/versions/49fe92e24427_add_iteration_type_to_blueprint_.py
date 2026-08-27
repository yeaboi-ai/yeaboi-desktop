"""add iteration_type to blueprint_iterations

Revision ID: 49fe92e24427
Revises: 040ad5ccd8e9
Create Date: 2026-04-04 11:06:59.676410

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "49fe92e24427"
down_revision: Union[str, Sequence[str], None] = "040ad5ccd8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add iteration_type column."""
    op.add_column(
        "blueprint_iterations",
        sa.Column("iteration_type", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    """Remove iteration_type column."""
    op.drop_column("blueprint_iterations", "iteration_type")
