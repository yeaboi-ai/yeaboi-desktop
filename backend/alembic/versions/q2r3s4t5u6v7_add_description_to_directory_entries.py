"""add description column to directory_entries

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-04-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "q2r3s4t5u6v7"
down_revision: str | Sequence[str] | None = "p1q2r3s4t5u6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _extract_description(content: str | None) -> str:
    """Same heuristic as routers/directory.py before this migration:
    first bold line, else first non-empty line truncated to 180 chars."""
    if not content:
        return ""
    for line in content.split("\n", 10):
        stripped = line.strip()
        if stripped.startswith("**") and stripped.endswith("**") and len(stripped) > 4:
            return stripped[2:-2].strip()
        if stripped:
            return stripped[:180]
    return ""


def upgrade() -> None:
    op.add_column(
        "directory_entries",
        sa.Column("description", sa.String(500), nullable=True),
    )

    # Backfill existing rows so /directory/tree stays functional without re-scan.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, content FROM directory_entries")).fetchall()
    for row in rows:
        desc = _extract_description(row.content)[:500]
        if desc:
            conn.execute(
                sa.text("UPDATE directory_entries SET description = :d WHERE id = :id"),
                {"d": desc, "id": row.id},
            )


def downgrade() -> None:
    op.drop_column("directory_entries", "description")
