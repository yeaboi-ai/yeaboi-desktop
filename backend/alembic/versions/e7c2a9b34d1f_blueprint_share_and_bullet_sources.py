"""blueprint share + bullet sources

Adds share_token / share_enabled to blueprint_iterations so each iteration can
expose a public read-only URL, and adds bullet_sources to blueprint_snapshots
so the document view can render per-bullet provenance chips.

Also serves as the merge point for the two outstanding alembic heads
(a2b3c4d5e6f7 and dd4e5f6a7b8c).

Revision ID: e7c2a9b34d1f
Revises: a2b3c4d5e6f7, dd4e5f6a7b8c
Create Date: 2026-05-13 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7c2a9b34d1f"
down_revision: Union[str, Sequence[str], None] = ("a2b3c4d5e6f7", "dd4e5f6a7b8c")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "blueprint_iterations",
        sa.Column("share_token", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_blueprint_iterations_share_token",
        "blueprint_iterations",
        ["share_token"],
        unique=True,
    )
    op.add_column(
        "blueprint_iterations",
        sa.Column(
            "share_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "blueprint_snapshots",
        sa.Column("bullet_sources", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("blueprint_snapshots", "bullet_sources")
    op.drop_column("blueprint_iterations", "share_enabled")
    op.drop_index(
        "ix_blueprint_iterations_share_token",
        table_name="blueprint_iterations",
    )
    op.drop_column("blueprint_iterations", "share_token")
