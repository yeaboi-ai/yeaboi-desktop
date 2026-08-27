"""add slack_event_dedup table

Revision ID: 96533667c25b
Revises: 8062e60ca5c6
Create Date: 2026-04-24 17:55:36.140127

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "96533667c25b"
down_revision: str | Sequence[str] | None = "8062e60ca5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    return table in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if not _table_exists("slack_event_dedup"):
        op.create_table(
            "slack_event_dedup",
            sa.Column("event_id", sa.String(64), primary_key=True),
            sa.Column("slack_team_id", sa.String(64), nullable=True),
            sa.Column("event_type", sa.String(64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    if _table_exists("slack_event_dedup"):
        op.drop_table("slack_event_dedup")
