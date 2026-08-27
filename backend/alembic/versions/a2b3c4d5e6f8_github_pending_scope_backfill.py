"""backfill active GitHub integrations to pending_scope

We've added per-repo scope selection for GitHub. Existing connections
implicitly consented to scan every repo their App installation can see;
that's the model we're retiring. Flip every active GitHub integration
that has not yet recorded an ``included_scopes`` selection back into
``pending_scope`` so the user is forced through the new scope picker
before any further scan runs.

This is a one-way data migration — the downgrade re-enables them blindly,
which is only useful if rolling back the new behaviour entirely. Customers
should be notified in-app + by email 24h before this migration runs.

Revision ID: a2b3c4d5e6f8
Revises: e9f1a2b3c4d5
Create Date: 2026-05-17 09:00:00.000000

Note: originally written with revision id ``a2b3c4d5e6f7``, which collided
with ``a2b3c4d5e6f7_drop_attachments_layout_entry.py``. Renumbered to
``a2b3c4d5e6f8`` and rechained onto the current local head when applying
locally; behaviour is identical.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a2b3c4d5e6f8"
down_revision: str | None = "e9f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # Only flip rows where metadata has no included_scopes set. JSON path
    # extraction differs by dialect; use a defensive LIKE rather than dialect-
    # specific JSON operators.
    conn.execute(
        sa.text(
            """
            UPDATE org_integrations
               SET status = 'pending_scope'
             WHERE provider = 'github'
               AND status = 'active'
               AND (
                    metadata IS NULL
                    OR metadata NOT LIKE '%"included_scopes"%'
               )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE org_integrations
               SET status = 'active'
             WHERE provider = 'github'
               AND status = 'pending_scope'
               AND (
                    metadata IS NULL
                    OR metadata NOT LIKE '%"included_scopes"%'
               )
            """
        )
    )
