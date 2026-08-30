"""add yeaboi_project_id to projects

The yeaboi engine's project row this platform project is a client of
(proj-<8hex>, minted lazily by the renderer on the first engine-touching
run). Soft reference — the engine's sessions.db is a different database.

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-08-30 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "i0j1k2l3m4n5"
down_revision: str | Sequence[str] | None = "h9i0j1k2l3m4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("yeaboi_project_id", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "yeaboi_project_id")
