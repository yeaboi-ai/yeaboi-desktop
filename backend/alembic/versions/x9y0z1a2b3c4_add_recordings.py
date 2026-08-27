"""add recordings table

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-05-05 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "x9y0z1a2b3c4"
down_revision: str | None = "w8x9y0z1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Per-call LiveKit Egress recordings. One row per egress; populated when
    # the call starts and finalized by the LiveKit webhook on egress_ended.
    op.create_table(
        "recordings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("started_by_id", sa.String(length=36), nullable=True),
        sa.Column("egress_id", sa.String(length=128), nullable=False),
        sa.Column("room_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="starting"),
        sa.Column("file_url", sa.String(length=1024), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("share_token", sa.String(length=24), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["started_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recordings_session_id", "recordings", ["session_id"])
    op.create_index("ix_recordings_egress_id", "recordings", ["egress_id"], unique=True)
    op.create_index("ix_recordings_share_token", "recordings", ["share_token"], unique=True)
    op.create_index("ix_recordings_expires_at", "recordings", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_recordings_expires_at", table_name="recordings")
    op.drop_index("ix_recordings_share_token", table_name="recordings")
    op.drop_index("ix_recordings_egress_id", table_name="recordings")
    op.drop_index("ix_recordings_session_id", table_name="recordings")
    op.drop_table("recordings")
