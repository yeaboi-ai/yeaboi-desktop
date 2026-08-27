"""drop deprecated 'attachments' field from ticket_templates.field_layout

The Attachments field is no longer a standalone ticket section — image and
file uploads happen inline inside description / comments via the rich text
editor. This migration strips any saved layout entries with key="attachments"
so they don't render a broken slot.

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
Create Date: 2026-05-10 12:00:00.000000

"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "z1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # JSONB filter is fast and atomic. Cast through jsonb because the column
        # may be stored as JSON or JSONB depending on when the table was created.
        op.execute(
            sa.text(
                """
                UPDATE ticket_templates
                SET field_layout = (
                    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                    FROM jsonb_array_elements(field_layout::jsonb) elem
                    WHERE elem->>'key' != 'attachments'
                )::json
                WHERE field_layout::text LIKE '%"attachments"%'
                """
            )
        )
    else:
        # SQLite (test backend) — read each row, filter in Python, write back.
        rows = bind.execute(
            sa.text("SELECT id, field_layout FROM ticket_templates")
        ).fetchall()
        for row in rows:
            raw = row.field_layout
            if not raw:
                continue
            layout = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(layout, list):
                continue
            cleaned = [
                e for e in layout
                if not (isinstance(e, dict) and e.get("key") == "attachments")
            ]
            if len(cleaned) != len(layout):
                bind.execute(
                    sa.text(
                        "UPDATE ticket_templates SET field_layout = :v WHERE id = :id"
                    ),
                    {"v": json.dumps(cleaned), "id": row.id},
                )


def downgrade() -> None:
    # Re-adding attachments to legacy layouts isn't worth the complexity — a
    # downgrade just leaves the layouts as-is. The frontend has no consumer
    # for the type anymore, so it would be a no-op even if re-added.
    pass
