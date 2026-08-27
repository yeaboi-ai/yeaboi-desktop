"""add generation modifiers (second axis of the style picker)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-21 13:30:00.000000

The first style migration (c3d4e5f6a7b8) added a single ``style`` slug per
job + project default. Real users want to compose orthogonal axes —
"many small tickets + spike-first + user-stories" — so this migration adds
the second axis as a JSON list alongside the existing slug:

- ``task_generation_jobs.modifiers`` (jsonb, default []) — the modifier list
  frozen on each job at dispatch.
- ``projects.default_modifiers`` (jsonb, default []) — the wizard's
  pre-selected modifiers for this project.

Semantically the existing ``style`` column is now "granularity"; the column
name stays for cheap backwards compat with code that already reads it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "task_generation_jobs",
        sa.Column(
            "modifiers",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "default_modifiers",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "default_modifiers")
    op.drop_column("task_generation_jobs", "modifiers")
