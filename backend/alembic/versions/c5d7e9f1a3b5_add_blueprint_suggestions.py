"""add blueprint_suggestions table

Revision ID: c5d7e9f1a3b5
Revises: y0z1a2b3c4d5
Create Date: 2026-05-05 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c5d7e9f1a3b5"
down_revision: str | None = "y0z1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "blueprint_suggestions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("section", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("edited_content", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=36), nullable=True),
        sa.Column("source_message_ids", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # Hot path is "list pending suggestions for this project/session" — index
    # on (project_id, status) keeps the badge query cheap as the table grows.
    op.create_index(
        "ix_blueprint_suggestions_project_status",
        "blueprint_suggestions",
        ["project_id", "status"],
    )
    op.create_index(
        "ix_blueprint_suggestions_session_status",
        "blueprint_suggestions",
        ["session_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_blueprint_suggestions_session_status", table_name="blueprint_suggestions")
    op.drop_index("ix_blueprint_suggestions_project_status", table_name="blueprint_suggestions")
    op.drop_table("blueprint_suggestions")
