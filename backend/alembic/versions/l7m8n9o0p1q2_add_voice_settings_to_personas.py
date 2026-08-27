"""add voice settings to personas and org ai defaults

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "l7m8n9o0p1q2"
down_revision: str | None = "a505caf445fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add voice columns to blueprint_personas (all nullable = inherit from org defaults)
    op.add_column("blueprint_personas", sa.Column("voice_id", sa.String(100), nullable=True))
    op.add_column("blueprint_personas", sa.Column("speed", sa.Float, nullable=True))
    op.add_column("blueprint_personas", sa.Column("emotion", sa.String(20), nullable=True))
    op.add_column("blueprint_personas", sa.Column("language", sa.String(10), nullable=True))
    op.add_column("blueprint_personas", sa.Column("realtime_voice", sa.String(30), nullable=True))

    # Create org_ai_defaults table
    op.create_table(
        "org_ai_defaults",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True
        ),
        sa.Column("voice_id", sa.String(100), nullable=True),
        sa.Column("speed", sa.Float, nullable=True),
        sa.Column("emotion", sa.String(20), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("realtime_voice", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("org_ai_defaults")
    op.drop_column("blueprint_personas", "realtime_voice")
    op.drop_column("blueprint_personas", "language")
    op.drop_column("blueprint_personas", "emotion")
    op.drop_column("blueprint_personas", "speed")
    op.drop_column("blueprint_personas", "voice_id")
