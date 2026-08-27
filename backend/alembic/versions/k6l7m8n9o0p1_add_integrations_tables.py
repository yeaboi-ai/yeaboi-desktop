"""add integrations tables

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-04-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "k6l7m8n9o0p1"
down_revision: str | None = "j5k6l7m8n9o0"
branch_labels: str | Sequence[str] | None = None
# This migration sits on a short branch directly off the j5k6l7m8n9o0
# branchpoint but FKs tables created on the *sibling* branch:
#   organizations    -> 9867002484f6  (add org/team tables)
#   directory_entries -> b2c3d4e5f6g8  (add directory_entries table)
# Without explicit deps Alembic may linearize this migration before those,
# failing from a fresh DB with "relation ... does not exist" (dev/prod only
# work because they were built incrementally). depends_on pins the ordering.
depends_on: str | Sequence[str] | None = ("9867002484f6", "b2c3d4e5f6g8")


def upgrade() -> None:
    op.create_table(
        "org_integrations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("auth_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credentials", sa.Text(), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("metadata", sa.Text(), nullable=True),
        sa.Column("connected_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_scan_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "provider", name="uq_org_integration_provider"),
    )
    op.create_index("ix_org_integration_category", "org_integrations", ["org_id", "category"])

    op.create_table(
        "integration_scan_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "integration_id",
            sa.String(36),
            sa.ForeignKey("org_integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scan_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resources_scanned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entries_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entries_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_calls_made", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_tokens_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
    )

    op.create_table(
        "integration_scan_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "scan_log_id",
            sa.String(36),
            sa.ForeignKey("integration_scan_logs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("resource_path", sa.String(500), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("ai_model_used", sa.String(50), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column(
            "directory_entry_id",
            sa.String(36),
            sa.ForeignKey("directory_entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column(
        "directory_entries",
        sa.Column(
            "integration_id",
            sa.String(36),
            sa.ForeignKey("org_integrations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "directory_entries",
        sa.Column("source_ref", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("directory_entries", "source_ref")
    op.drop_column("directory_entries", "integration_id")
    op.drop_table("integration_scan_items")
    op.drop_table("integration_scan_logs")
    op.drop_index("ix_org_integration_category", table_name="org_integrations")
    op.drop_table("org_integrations")
