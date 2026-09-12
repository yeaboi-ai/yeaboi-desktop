"""a room row remembers the engine plan it belongs to

The planning conversation lives in the yeaboi sidecar's session store; the
row here carries the call, the recordings and the board for that plan. The
link is the engine's session id, set once when the row is made and looked up
by the list route's ``yeaboi_session_id`` filter.

Revision ID: rm03_link_engine_session
Revises: rm02_collapse_project
Create Date: 2026-09-12 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rm03_link_engine_session"
down_revision: str | Sequence[str] | None = "rm02_collapse_project"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sessions") as batch:
        batch.add_column(sa.Column("yeaboi_session_id", sa.String(64), nullable=True))
        batch.create_index("ix_sessions_yeaboi_session_id", ["yeaboi_session_id"])


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch:
        batch.drop_index("ix_sessions_yeaboi_session_id")
        batch.drop_column("yeaboi_session_id")
