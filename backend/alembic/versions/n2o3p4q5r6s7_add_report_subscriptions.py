"""add report_subscriptions and subscription_runs tables

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-05-09 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "n2o3p4q5r6s7"
down_revision: str | Sequence[str] | None = "m1n2o3p4q5r6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scope_kind", sa.String(length=20), nullable=False),
        sa.Column("scope_id", sa.String(length=36), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("schedule_config", sa.JSON(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.Column("formats", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_subscriptions_org", "report_subscriptions", ["org_id", "is_active"])
    op.create_index("ix_report_subscriptions_next_run", "report_subscriptions", ["next_run_at"])

    op.create_table(
        "subscription_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("subscription_id", sa.String(length=36), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.String(length=2000), nullable=True),
        sa.Column("deliveries", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["subscription_id"], ["report_subscriptions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subscription_runs_subscription", "subscription_runs", ["subscription_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_subscription_runs_subscription", table_name="subscription_runs")
    op.drop_table("subscription_runs")
    op.drop_index("ix_report_subscriptions_next_run", table_name="report_subscriptions")
    op.drop_index("ix_report_subscriptions_org", table_name="report_subscriptions")
    op.drop_table("report_subscriptions")
