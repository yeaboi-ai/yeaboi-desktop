"""add Card.sequence + merge prior heads

Two independent heads existed (bb2c3d4e5f6a card_views, p4q5r6s7t8u9 column
lifecycle flags). This revision merges them and adds the new ``sequence``
column the AI generator now persists alongside ``wave``.

Revision ID: cc3d4e5f6a7b
Revises: bb2c3d4e5f6a, p4q5r6s7t8u9
Create Date: 2026-05-09 19:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "cc3d4e5f6a7b"
down_revision: tuple[str, ...] | str | None = ("bb2c3d4e5f6a", "p4q5r6s7t8u9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cards", sa.Column("sequence", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("cards", "sequence")
