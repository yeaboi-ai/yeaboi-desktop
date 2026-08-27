"""add task_generation_jobs

Revision ID: e9f1a2b3c4d5
Revises: d7e8f9a0b1c2
Create Date: 2026-05-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e9f1a2b3c4d5"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "task_generation_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_wave", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("waves_complete", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("partial_tasks", sa.JSON(), nullable=False),
        sa.Column("templates_payload", sa.JSON(), nullable=True),
        sa.Column("feedback_context", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_task_generation_jobs_session_status",
        "task_generation_jobs",
        ["session_id", "status"],
    )
    op.create_index(
        "ix_task_generation_jobs_project_status",
        "task_generation_jobs",
        ["project_id", "status"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_task_generation_jobs_project_status", table_name="task_generation_jobs")
    op.drop_index("ix_task_generation_jobs_session_status", table_name="task_generation_jobs")
    op.drop_table("task_generation_jobs")
