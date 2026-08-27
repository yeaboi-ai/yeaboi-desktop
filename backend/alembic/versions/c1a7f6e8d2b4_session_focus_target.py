"""session focus_target

Adds the richer focus_target JSON column used by the coverage-aware session
launcher. focus_sections is kept as the canonical "which sections is this
session scoped to" view for back-compat; focus_target carries the launcher
mode + selected bullets so the facilitator can deep-dive on specific
content within a section.

Revision ID: c1a7f6e8d2b4
Revises: f8d3b1c9e4a2
Create Date: 2026-05-16 00:00:00.000001
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1a7f6e8d2b4"
down_revision: Union[str, Sequence[str], None] = "f8d3b1c9e4a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("focus_target", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "focus_target")
