"""add audio_url to chat_messages

Revision ID: 39ee843dedbc
Revises: c3d4e5f6g7h9
Create Date: 2026-04-01 05:17:15.457166

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "39ee843dedbc"
down_revision: str | Sequence[str] | None = "c3d4e5f6g7h9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("audio_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "audio_url")
