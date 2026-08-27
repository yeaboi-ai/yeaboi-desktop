"""usage_events: set ON DELETE SET NULL on session_id + project_id FKs

The original migration created the FKs without an ondelete clause (defaults
to NO ACTION), which blocked deletion of any session that had recorded an
AI usage event. Switching to SET NULL preserves the billing rows while
freeing sessions/projects to be deleted — the org_id link keeps roll-ups
intact for billing.

Revision ID: c9d0e1f2a3b4
Revises: a2b3c4d5e6f8
Create Date: 2026-05-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "a2b3c4d5e6f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres doesn't allow altering ON DELETE in place — drop + recreate.
    op.drop_constraint("usage_events_session_id_fkey", "usage_events", type_="foreignkey")
    op.create_foreign_key(
        "usage_events_session_id_fkey",
        "usage_events",
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint("usage_events_project_id_fkey", "usage_events", type_="foreignkey")
    op.create_foreign_key(
        "usage_events_project_id_fkey",
        "usage_events",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("usage_events_session_id_fkey", "usage_events", type_="foreignkey")
    op.create_foreign_key(
        "usage_events_session_id_fkey",
        "usage_events",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.drop_constraint("usage_events_project_id_fkey", "usage_events", type_="foreignkey")
    op.create_foreign_key(
        "usage_events_project_id_fkey",
        "usage_events",
        "projects",
        ["project_id"],
        ["id"],
    )
