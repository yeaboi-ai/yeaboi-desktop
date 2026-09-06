"""add status to projects

A project is `active` until its owner marks it `done`. Explicit, and separate
from archive/delete: a done project stays listed, under Completed.

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-09-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "j1k2l3m4n5o6"
down_revision: str | Sequence[str] | None = "i0j1k2l3m4n5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("status", sa.String(20), nullable=False, server_default="active"))


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("status")
