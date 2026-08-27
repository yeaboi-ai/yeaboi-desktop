"""add FTS tsvector column to directory_entries (Postgres only)

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-04-17 00:00:00.000000

On Postgres, adds a GENERATED ALWAYS tsvector column over
(title, description, content) plus a GIN index. Auto-updates on write
— no trigger needed (Postgres 12+).

On SQLite (tests) this migration is a no-op; retrieval falls back to
the in-python ranker.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "r3s4t5u6v7w8"
down_revision: str | Sequence[str] | None = "q2r3s4t5u6v7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite + other dialects: skip. Retrieval will use the python scorer.
        return

    op.execute(
        """
        ALTER TABLE directory_entries
        ADD COLUMN search_tsv tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' ||
                coalesce(description, '') || ' ' ||
                coalesce(content, '')
            )
        ) STORED
        """
    )
    op.execute(
        "CREATE INDEX ix_directory_entries_search_tsv "
        "ON directory_entries USING GIN (search_tsv)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS ix_directory_entries_search_tsv")
    op.execute("ALTER TABLE directory_entries DROP COLUMN IF EXISTS search_tsv")
