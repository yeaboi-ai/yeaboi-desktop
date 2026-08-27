"""add spend limit columns to org_ai_config and org_spend_alerts_sent dedup table

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-05-09 13:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "o3p4q5r6s7t8"
down_revision: str | Sequence[str] | None = "n2o3p4q5r6s7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "org_ai_config",
        sa.Column("monthly_spend_soft_limit_usd", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.add_column(
        "org_ai_config",
        sa.Column("monthly_spend_hard_limit_usd", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.add_column(
        "org_ai_config",
        sa.Column("spend_alert_email", sa.String(length=255), nullable=True),
    )

    op.create_table(
        "org_spend_alerts_sent",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_org_spend_alerts_sent",
        "org_spend_alerts_sent",
        ["org_id", "year_month", "threshold"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_org_spend_alerts_sent", table_name="org_spend_alerts_sent")
    op.drop_table("org_spend_alerts_sent")
    op.drop_column("org_ai_config", "spend_alert_email")
    op.drop_column("org_ai_config", "monthly_spend_hard_limit_usd")
    op.drop_column("org_ai_config", "monthly_spend_soft_limit_usd")
