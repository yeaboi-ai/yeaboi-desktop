"""add org team tables and org_id columns

Revision ID: 9867002484f6
Revises: d9781a99815e
Create Date: 2026-03-22 12:10:27.731142

"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9867002484f6"
down_revision: str | Sequence[str] | None = "d9781a99815e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create org/team tables
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("plan", sa.String(length=50), server_default="free", nullable=False),
        sa.Column("billing_email", sa.String(length=255), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "org_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), server_default="member", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "teams",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "team_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), server_default="member", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Add nullable org_id/team_id columns
    op.add_column("projects", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.add_column("projects", sa.Column("team_id", sa.String(length=36), nullable=True))
    op.add_column("projects", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_projects_org_id", "projects", "organizations", ["org_id"], ["id"])
    op.create_foreign_key("fk_projects_team_id", "projects", "teams", ["team_id"], ["id"])
    op.add_column("boards", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_boards_org_id", "boards", "organizations", ["org_id"], ["id"])
    op.add_column("sessions", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_sessions_org_id", "sessions", "organizations", ["org_id"], ["id"])
    op.add_column("blueprint_snapshots", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_blueprint_snapshots_org_id", "blueprint_snapshots", "organizations", ["org_id"], ["id"])
    op.add_column("notifications", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_notifications_org_id", "notifications", "organizations", ["org_id"], ["id"])
    op.add_column("harness_configs", sa.Column("org_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_harness_configs_org_id", "harness_configs", "organizations", ["org_id"], ["id"])

    # 3. Inline backfill — create default org/team, assign all existing data
    conn = op.get_bind()

    org_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())

    conn.execute(
        sa.text(
            "INSERT INTO organizations (id, name, slug, plan, created_at, updated_at) "
            "VALUES (:id, :name, :slug, :plan, now(), now())"
        ),
        {"id": org_id, "name": "Default Organization", "slug": "default", "plan": "free"},
    )

    conn.execute(
        sa.text(
            "INSERT INTO teams (id, org_id, name, slug, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :slug, now(), now())"
        ),
        {"id": team_id, "org_id": org_id, "name": "Default Team", "slug": "default"},
    )

    # Add all existing users to org and team
    users = conn.execute(sa.text("SELECT id, role FROM users")).fetchall()
    for user in users:
        conn.execute(
            sa.text(
                "INSERT INTO org_members (id, org_id, user_id, role, created_at, updated_at) "
                "VALUES (:id, :org_id, :user_id, :role, now(), now())"
            ),
            {"id": str(uuid.uuid4()), "org_id": org_id, "user_id": user[0], "role": user[1] or "member"},
        )
        conn.execute(
            sa.text(
                "INSERT INTO team_members (id, team_id, user_id, role, created_at, updated_at) "
                "VALUES (:id, :team_id, :user_id, :role, now(), now())"
            ),
            {"id": str(uuid.uuid4()), "team_id": team_id, "user_id": user[0], "role": user[1] or "member"},
        )

    # Backfill all data tables
    conn.execute(
        sa.text("UPDATE projects SET org_id = :org_id, team_id = :team_id WHERE org_id IS NULL"),
        {"org_id": org_id, "team_id": team_id},
    )
    for table in ["boards", "sessions", "blueprint_snapshots", "notifications", "harness_configs"]:
        try:
            conn.execute(sa.text(f"UPDATE {table} SET org_id = :org_id WHERE org_id IS NULL"), {"org_id": org_id})
        except Exception:
            pass  # Table may not have rows

    # 4. Now make NOT NULL
    op.alter_column("projects", "org_id", nullable=False)
    op.alter_column("projects", "team_id", nullable=False)
    op.alter_column("boards", "org_id", nullable=False)
    op.alter_column("sessions", "org_id", nullable=False)

    # Add indexes
    op.create_index("ix_projects_org_id", "projects", ["org_id"])
    op.create_index("ix_boards_org_id", "boards", ["org_id"])
    op.create_index("ix_sessions_org_id", "sessions", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_sessions_org_id", "sessions")
    op.drop_index("ix_boards_org_id", "boards")
    op.drop_index("ix_projects_org_id", "projects")
    op.alter_column("sessions", "org_id", nullable=True)
    op.alter_column("boards", "org_id", nullable=True)
    op.alter_column("projects", "team_id", nullable=True)
    op.alter_column("projects", "org_id", nullable=True)
    op.drop_constraint("fk_sessions_org_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "org_id")
    op.drop_constraint("fk_harness_configs_org_id", "harness_configs", type_="foreignkey")
    op.drop_column("harness_configs", "org_id")
    op.drop_constraint("fk_notifications_org_id", "notifications", type_="foreignkey")
    op.drop_column("notifications", "org_id")
    op.drop_constraint("fk_blueprint_snapshots_org_id", "blueprint_snapshots", type_="foreignkey")
    op.drop_column("blueprint_snapshots", "org_id")
    op.drop_constraint("fk_boards_org_id", "boards", type_="foreignkey")
    op.drop_column("boards", "org_id")
    op.drop_constraint("fk_projects_org_id", "projects", type_="foreignkey")
    op.drop_constraint("fk_projects_team_id", "projects", type_="foreignkey")
    op.drop_column("projects", "deleted_at")
    op.drop_column("projects", "team_id")
    op.drop_column("projects", "org_id")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("org_members")
    op.drop_table("organizations")
