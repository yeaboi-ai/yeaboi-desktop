"""add slack_session_announcements

Tracks where each session-created Block Kit message was posted so we can
chat.delete it when the session is deleted (removing the dead "Open session"
button).

Revision ID: 67183722e2b6
Revises: 96533667c25b
Create Date: 2026-04-24 19:44:27.500695
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "67183722e2b6"
down_revision: str | Sequence[str] | None = "96533667c25b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    return table in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if _table_exists("slack_session_announcements"):
        return
    op.create_table(
        "slack_session_announcements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("org_id", sa.String(36), nullable=False),
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("message_ts", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_slack_session_announcements_session_id",
        "slack_session_announcements",
        ["session_id"],
    )


def downgrade() -> None:
    if not _table_exists("slack_session_announcements"):
        return
    op.drop_index(
        "ix_slack_session_announcements_session_id",
        table_name="slack_session_announcements",
    )
    op.drop_table("slack_session_announcements")
