"""add generation style and repo analysis jobs

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a6
Create Date: 2026-06-21 12:40:00.000000

Three additions for the ticket-generation style picker (issue #90):

1. ``projects.default_generation_style`` — per-project default style for the
   wizard's StylePicker. NULL means "use today's behaviour" so legacy projects
   don't suddenly start generating with a different style.
2. ``task_generation_jobs.style`` + ``repo_profile_json`` — the style chosen
   for an in-flight job (frozen at dispatch) and the repo profile snapshot
   used for ``follow_practices`` runs.
3. ``repo_analysis_jobs`` — new table caching the conventions profile
   extracted from a project's linked GitHub repo. Latest-wins per project,
   7-day TTL (enforced in app code).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
# Main already had two unconsolidated heads when this branch rebased:
#   - c2d3e4f5a6b7 (onboarding_state_and_demo_flag)
#   - d7e8f9a0b1c2 (add_upstream_status_url_to_components)
# Use a merge revision (tuple parent) so `alembic upgrade head` walks one
# linear graph: both parents → c3d4e5f6a7b8 → … → f6a7b8c9d0e1.
down_revision: tuple[str, ...] = ("c2d3e4f5a6b7", "d7e8f9a0b1c2")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("default_generation_style", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "task_generation_jobs",
        sa.Column(
            "style",
            sa.String(length=32),
            nullable=False,
            server_default="balanced",
        ),
    )
    op.add_column(
        "task_generation_jobs",
        sa.Column("repo_profile_json", sa.JSON(), nullable=True),
    )

    op.create_table(
        "repo_analysis_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_id",
            sa.String(length=36),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("repo_full_name", sa.String(length=255), nullable=True),
        sa.Column("profile_json", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_repo_analysis_jobs_project_status",
        "repo_analysis_jobs",
        ["project_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_repo_analysis_jobs_project_status", table_name="repo_analysis_jobs")
    op.drop_table("repo_analysis_jobs")
    op.drop_column("task_generation_jobs", "repo_profile_json")
    op.drop_column("task_generation_jobs", "style")
    op.drop_column("projects", "default_generation_style")
