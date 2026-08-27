"""slack follow-ups — team channels + user links

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-04-17 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "s4t5u6v7w8x9"
down_revision: str | None = "r3s4t5u6v7w8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    return table_name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    # Idempotent: some environments already have these tables from a
    # pre-migration manual CREATE during Slack integration development.
    if not _table_exists("team_slack_channels"):
        op.create_table(
            "team_slack_channels",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("team_id", sa.String(36), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("slack_channel_id", sa.String(64), nullable=False),
            sa.Column("slack_channel_name", sa.String(255), nullable=True),
            sa.Column("event_types", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("team_id", "slack_channel_id", name="uq_team_slack_channel"),
        )
        op.create_index("ix_team_slack_channels_team_id", "team_slack_channels", ["team_id"])

    if not _table_exists("slack_user_links"):
        op.create_table(
            "slack_user_links",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("slack_team_id", sa.String(64), nullable=False),
            sa.Column("slack_user_id", sa.String(64), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("verified_via", sa.String(32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("slack_team_id", "slack_user_id", name="uq_slack_user_link"),
        )


def downgrade() -> None:
    op.drop_table("slack_user_links")
    op.drop_index("ix_team_slack_channels_team_id", table_name="team_slack_channels")
    op.drop_table("team_slack_channels")
