"""add profile fields to users

Revision ID: a7b8c9d0e1f2
Revises: e7c2a9b34d1f
Create Date: 2026-05-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "e7c2a9b34d1f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pronouns", sa.String(40), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(280), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "timezone")
    op.drop_column("users", "bio")
    op.drop_column("users", "job_title")
    op.drop_column("users", "pronouns")
