"""add usage_events and pricing_overrides tables

Revision ID: m1n2o3p4q5r6
Revises: aa1b2c3d4e5f, h4i5j6k7l8m9
Create Date: 2026-05-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m1n2o3p4q5r6"
down_revision: str | Sequence[str] | None = ("aa1b2c3d4e5f", "h4i5j6k7l8m9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "usage_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=True),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("units", sa.JSON(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("is_estimated", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_usage_events_org_occurred", "usage_events", ["org_id", "occurred_at"])
    op.create_index("ix_usage_events_project_occurred", "usage_events", ["project_id", "occurred_at"])
    op.create_index("ix_usage_events_session", "usage_events", ["session_id"])
    op.create_index("ix_usage_events_provider_occurred", "usage_events", ["provider", "occurred_at"])

    # Backfill idempotency: at most one estimated row per (session, provider,
    # operation) when source='backfill'. Lets us re-run the script safely.
    # SQLite supports partial indexes via the `sqlite_where` kwarg in CREATE
    # INDEX; Alembic exposes this through `postgresql_where` for PG. We add
    # both so the index works in dev/test (SQLite) and prod (Postgres).
    op.create_index(
        "uq_usage_events_backfill_dedup",
        "usage_events",
        ["session_id", "provider", "operation"],
        unique=True,
        postgresql_where=sa.text("source = 'backfill'"),
        sqlite_where=sa.text("source = 'backfill'"),
    )

    op.create_table(
        "pricing_overrides",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("price_usd", sa.Numeric(precision=14, scale=8), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pricing_overrides_lookup",
        "pricing_overrides",
        ["provider", "operation", "model", "org_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_pricing_overrides_lookup", table_name="pricing_overrides")
    op.drop_table("pricing_overrides")
    op.drop_index("uq_usage_events_backfill_dedup", table_name="usage_events")
    op.drop_index("ix_usage_events_provider_occurred", table_name="usage_events")
    op.drop_index("ix_usage_events_session", table_name="usage_events")
    op.drop_index("ix_usage_events_project_occurred", table_name="usage_events")
    op.drop_index("ix_usage_events_org_occurred", table_name="usage_events")
    op.drop_table("usage_events")
