"""add last_viewed_project_id to teams

Nullable FK on teams.last_viewed_project_id → projects.id, ON DELETE SET NULL.

Revision ID: 8062e60ca5c6
Revises: s4t5u6v7w8x9
Create Date: 2026-04-20 16:51:40.512761

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8062e60ca5c6"
down_revision: str | Sequence[str] | None = "u6v7w8x9y0z1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column for col in inspector.get_columns(table))


def upgrade() -> None:
    if not _column_exists("teams", "last_viewed_project_id"):
        op.add_column(
            "teams",
            sa.Column(
                "last_viewed_project_id",
                sa.String(36),
                sa.ForeignKey(
                    "projects.id",
                    name="fk_teams_last_viewed_project_id_projects",
                    ondelete="SET NULL",
                ),
                nullable=True,
            ),
        )


def downgrade() -> None:
    if _column_exists("teams", "last_viewed_project_id"):
        # Most databases drop the FK automatically when the column goes; be
        # explicit just in case the backend doesn't cascade.
        try:
            op.drop_constraint(
                "fk_teams_last_viewed_project_id_projects",
                "teams",
                type_="foreignkey",
            )
        except Exception:
            pass
        op.drop_column("teams", "last_viewed_project_id")
