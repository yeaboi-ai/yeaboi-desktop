"""cascade delete notifications on project delete

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-03-21 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "i4j5k6l7m8n9"
down_revision: str | None = "10394e417b6c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("notifications_project_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key(
        "notifications_project_id_fkey",
        "notifications",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("notifications_project_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key(
        "notifications_project_id_fkey",
        "notifications",
        "projects",
        ["project_id"],
        ["id"],
    )
