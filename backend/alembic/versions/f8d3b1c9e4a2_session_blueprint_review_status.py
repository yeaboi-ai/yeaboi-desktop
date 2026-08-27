"""session blueprint review status

Adds blueprint_review_status / blueprint_review_completed_at to sessions so
the post-session "what changed" review can nudge users to resolve pending
suggestions and explicitly close the loop.

Backfills 'pending' for any session that already has at least one pending
BlueprintSuggestion — otherwise leaves it at 'none' so completed sessions
without anything to review don't get a stray pill in the UI.

Revision ID: f8d3b1c9e4a2
Revises: e7c2a9b34d1f, a7b8c9d0e1f2
Create Date: 2026-05-16 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f8d3b1c9e4a2"
down_revision: Union[str, Sequence[str], None] = ("e7c2a9b34d1f", "a7b8c9d0e1f2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "blueprint_review_status",
            sa.String(length=20),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "sessions",
        sa.Column(
            "blueprint_review_completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Backfill: any session with pending suggestions enters the new flow at
    # 'pending'. UPDATE … FROM works on Postgres; SQLite (tests) uses an
    # in-memory store with no rows to backfill, so the same statement is a
    # no-op there.
    op.execute(
        """
        UPDATE sessions
           SET blueprint_review_status = 'pending'
         WHERE id IN (
            SELECT DISTINCT session_id
              FROM blueprint_suggestions
             WHERE status = 'pending'
               AND session_id IS NOT NULL
         )
        """
    )


def downgrade() -> None:
    op.drop_column("sessions", "blueprint_review_completed_at")
    op.drop_column("sessions", "blueprint_review_status")
