"""add recording_consent + session_extraction

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-05-04 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "w8x9y0z1a2b3"
down_revision: str | None = "v7w8x9y0z1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # W5.7.4 — track per-participant consent for AI recording/transcription.
    # Tri-state: NULL (not yet decided) / true (granted) / false (declined).
    op.add_column(
        "participants",
        sa.Column("recording_consent", sa.Boolean(), nullable=True),
    )
    # W6.6.3 — at session-complete time the agent runs a final extraction
    # pass and stores three buckets here: decisions, action_items, open_questions.
    # Each item carries a ts (ISO timestamp pointing back into the transcript).
    op.add_column(
        "sessions",
        sa.Column("session_extraction", sa.JSON(), nullable=True),
    )
    # W6.6.2 — shareable transcript clips. Text-only for now; audio bytes
    # remain server-side and aren't exposed via the share link.
    op.create_table(
        "session_clips",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("share_token", sa.String(length=24), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        # JSON-serialized transcript lines: [{ts, speaker, text}].
        sa.Column("transcript", sa.JSON(), nullable=False),
        sa.Column("start_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_ts", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_clips_session_id", "session_clips", ["session_id"])
    op.create_index("ix_session_clips_share_token", "session_clips", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_session_clips_share_token", table_name="session_clips")
    op.drop_index("ix_session_clips_session_id", table_name="session_clips")
    op.drop_table("session_clips")
    op.drop_column("sessions", "session_extraction")
    op.drop_column("participants", "recording_consent")
