"""add role field to users

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-03-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(20),
            nullable=False,
            server_default="member",
        ),
    )
    # Promote the first existing user (earliest created_at) to admin
    op.execute(
        """
        UPDATE users
        SET role = 'admin'
        WHERE id = (
            SELECT id FROM users ORDER BY created_at ASC LIMIT 1
        )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "role")
