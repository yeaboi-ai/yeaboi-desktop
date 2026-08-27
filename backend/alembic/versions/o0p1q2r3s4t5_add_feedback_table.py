"""add feedback table

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-04-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "o0p1q2r3s4t5"
down_revision: str | Sequence[str] | None = "n9o0p1q2r3s4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=True),
        sa.Column("agent_type", sa.String(20), nullable=False),
        sa.Column("rating", sa.String(20), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_unique_constraint("uq_feedback_user_target", "feedback", ["user_id", "target_type", "target_id"])
    op.create_index("ix_feedback_session", "feedback", ["session_id"])
    op.create_index("ix_feedback_user_created", "feedback", ["user_id", "created_at"])
    op.create_index("ix_feedback_target", "feedback", ["target_type", "target_id"])
    op.create_index("ix_feedback_org_created", "feedback", ["org_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedback_org_created", table_name="feedback")
    op.drop_index("ix_feedback_target", table_name="feedback")
    op.drop_index("ix_feedback_user_created", table_name="feedback")
    op.drop_index("ix_feedback_session", table_name="feedback")
    op.drop_constraint("uq_feedback_user_target", "feedback", type_="unique")
    op.drop_table("feedback")
