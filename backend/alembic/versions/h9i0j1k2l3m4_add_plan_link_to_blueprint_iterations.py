"""add plan link to blueprint_iterations

The yeaboi engine's planning session that generated an iteration's plan:
yeaboi_session_id (soft reference into the sidecar's SessionStore),
plan_generated_at, and plan_source_snapshot_id (soft reference to the
blueprint snapshot the plan was built from, for staleness detection).

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-08-30 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "h9i0j1k2l3m4"
down_revision: str | Sequence[str] | None = "g8h9i0j1k2l3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("blueprint_iterations", sa.Column("yeaboi_session_id", sa.String(64), nullable=True))
    op.add_column("blueprint_iterations", sa.Column("plan_generated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("blueprint_iterations", sa.Column("plan_source_snapshot_id", sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column("blueprint_iterations", "plan_source_snapshot_id")
    op.drop_column("blueprint_iterations", "plan_generated_at")
    op.drop_column("blueprint_iterations", "yeaboi_session_id")
