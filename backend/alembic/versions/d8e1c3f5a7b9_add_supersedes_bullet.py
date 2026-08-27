"""add supersedes_bullet to blueprint_suggestions

Revision ID: d8e1c3f5a7b9
Revises: c5d7e9f1a3b5
Create Date: 2026-05-06 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8e1c3f5a7b9"
down_revision: str | None = "c5d7e9f1a3b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add nullable text column for the existing bullet a suggestion replaces.

    When the LLM extractor identifies that a new fact contradicts or updates
    an existing bullet in the same section, it captures the old bullet here.
    The accept-suggestion service uses this to support a 'replace' mode that
    strips the superseded bullet before merging the new one.
    """
    op.add_column(
        "blueprint_suggestions",
        sa.Column("supersedes_bullet", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("blueprint_suggestions", "supersedes_bullet")
