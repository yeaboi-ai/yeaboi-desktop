"""add column lifecycle flags + accent_color to board_columns

Adds role flags so the orchestrator can locate lifecycle states (start, done,
agent trigger, agent review) by flag rather than by hardcoded column name.
Backfills the flags on the five default columns ("Backlog", "To Do", "In
Progress", "Review", "Done") so existing boards keep working without manual
intervention. Also adds an optional accent_color (hex string) for the upcoming
column-customization UI.

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-05-09 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p4q5r6s7t8u9"
down_revision: str | None = "o3p4q5r6s7t8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "board_columns",
        sa.Column("is_start_state", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "board_columns",
        sa.Column("is_done_state", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "board_columns",
        sa.Column("agent_trigger_state", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "board_columns",
        sa.Column("agent_review_state", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "board_columns",
        sa.Column("accent_color", sa.String(7), nullable=True),
    )

    # Backfill the flags for the five default columns. case-insensitive match so
    # boards seeded before this migration ("Backlog", "To Do"…) get tagged correctly.
    op.execute(
        """
        UPDATE board_columns
        SET is_start_state = TRUE
        WHERE LOWER(name) = 'backlog'
        """
    )
    op.execute(
        """
        UPDATE board_columns
        SET agent_trigger_state = TRUE
        WHERE LOWER(name) = 'to do'
        """
    )
    op.execute(
        """
        UPDATE board_columns
        SET agent_review_state = TRUE
        WHERE LOWER(name) = 'review'
        """
    )
    op.execute(
        """
        UPDATE board_columns
        SET is_done_state = TRUE
        WHERE LOWER(name) = 'done'
        """
    )


def downgrade() -> None:
    op.drop_column("board_columns", "accent_color")
    op.drop_column("board_columns", "agent_review_state")
    op.drop_column("board_columns", "agent_trigger_state")
    op.drop_column("board_columns", "is_done_state")
    op.drop_column("board_columns", "is_start_state")
