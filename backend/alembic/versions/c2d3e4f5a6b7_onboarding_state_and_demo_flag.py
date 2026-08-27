"""onboarding state and demo flag

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-21 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("tour_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("intended_use", sa.Text(), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Backfill: existing users with a display_name set are already onboarded.
    # Without this, the new gate (`!onboarded_at → /onboarding`) would bounce
    # every pre-migration user back through onboarding.
    op.execute(
        "UPDATE users SET onboarded_at = updated_at "
        "WHERE display_name IS NOT NULL AND onboarded_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("projects", "is_demo")
    op.drop_column("users", "intended_use")
    op.drop_column("users", "tour_completed_at")
    op.drop_column("users", "onboarded_at")
