"""add invite_token and invite_claimed fields to users

Revision ID: f1a2b3c4d5e6
Revises: e2f3a4b5c6d7
Create Date: 2026-03-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("invite_token", sa.String(36), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "invite_claimed",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.create_unique_constraint("uq_users_invite_token", "users", ["invite_token"])


def downgrade() -> None:
    op.drop_constraint("uq_users_invite_token", "users", type_="unique")
    op.drop_column("users", "invite_claimed")
    op.drop_column("users", "invite_token")
