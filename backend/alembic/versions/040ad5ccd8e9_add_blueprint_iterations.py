"""add blueprint iterations

Revision ID: 040ad5ccd8e9
Revises: 557849e3e565
Create Date: 2026-04-04 10:03:28.454006

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "040ad5ccd8e9"
down_revision: Union[str, Sequence[str], None] = "557849e3e565"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add blueprint_iterations table and link to snapshots, boards, sessions."""
    # 1. Create blueprint_iterations table
    op.create_table(
        "blueprint_iterations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=True),
        sa.Column("iteration_number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "locked_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("locked_by", sa.String(length=36), nullable=True),
        sa.Column("forked_from_id", sa.String(length=36), nullable=True),
        sa.Column("parent_out_of_scope", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["forked_from_id"], ["blueprint_iterations.id"]
        ),
        sa.ForeignKeyConstraint(["locked_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Add iteration_id columns (nullable for now)
    op.add_column(
        "blueprint_snapshots",
        sa.Column("iteration_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_snapshots_iteration",
        "blueprint_snapshots",
        "blueprint_iterations",
        ["iteration_id"],
        ["id"],
    )

    op.add_column(
        "boards",
        sa.Column("iteration_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_boards_iteration",
        "boards",
        "blueprint_iterations",
        ["iteration_id"],
        ["id"],
    )

    op.add_column(
        "sessions",
        sa.Column("iteration_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_sessions_iteration",
        "sessions",
        "blueprint_iterations",
        ["iteration_id"],
        ["id"],
    )

    # 3. Remove unique constraint on boards.project_id (allow multiple boards per project)
    op.drop_constraint("boards_project_id_key", "boards", type_="unique")

    # 4. Data migration: create a default v1 iteration for each project that has snapshots
    conn = op.get_bind()
    projects = conn.execute(
        sa.text(
            "SELECT DISTINCT project_id, org_id "
            "FROM blueprint_snapshots"
        )
    ).fetchall()

    for row in projects:
        import uuid

        iter_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                "INSERT INTO blueprint_iterations "
                "(id, project_id, org_id, iteration_number, label, status) "
                "VALUES (:id, :pid, :oid, 1, 'v1', 'planning')"
            ),
            {"id": iter_id, "pid": row[0], "oid": row[1]},
        )
        # Backfill snapshots
        conn.execute(
            sa.text(
                "UPDATE blueprint_snapshots SET iteration_id = :iid "
                "WHERE project_id = :pid"
            ),
            {"iid": iter_id, "pid": row[0]},
        )
        # Backfill boards
        conn.execute(
            sa.text(
                "UPDATE boards SET iteration_id = :iid "
                "WHERE project_id = :pid"
            ),
            {"iid": iter_id, "pid": row[0]},
        )
        # Backfill sessions
        conn.execute(
            sa.text(
                "UPDATE sessions SET iteration_id = :iid "
                "WHERE project_id = :pid"
            ),
            {"iid": iter_id, "pid": row[0]},
        )


def downgrade() -> None:
    """Remove blueprint iterations."""
    op.drop_constraint(
        "fk_sessions_iteration", "sessions", type_="foreignkey"
    )
    op.drop_column("sessions", "iteration_id")

    op.drop_constraint(
        "fk_boards_iteration", "boards", type_="foreignkey"
    )
    op.create_unique_constraint(
        "boards_project_id_key", "boards", ["project_id"]
    )
    op.drop_column("boards", "iteration_id")

    op.drop_constraint(
        "fk_snapshots_iteration",
        "blueprint_snapshots",
        type_="foreignkey",
    )
    op.drop_column("blueprint_snapshots", "iteration_id")

    op.drop_table("blueprint_iterations")
