"""a session is the workspace: sessions absorbs projects

Every table that pointed at a project now points at a session. Where a table
already carried both ids the project column simply goes — five of them did,
which is the clearest evidence available that the two nouns were always one.

The tables are empty (rm01_purge_projects emptied them), so nothing is backfilled and
no column needs a default to become NOT NULL.

Order is load-bearing: sessions grows its new columns and sheds project_id
first, then the children drop, then the children rename. A renamed column also
has to shed the foreign key it inherited — SQLite's batch mode copies reflected
constraints verbatim, so a plain rename would leave every child pointing at a
table this revision is about to drop.

Revision ID: rm02_collapse_project
Revises: rm01_purge_projects
Create Date: 2026-09-10 00:00:01.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rm02_collapse_project"
down_revision: str | Sequence[str] | None = "rm01_purge_projects"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: What a session gains from the project it used to live in.
_ABSORBED = (
    sa.Column("name", sa.String(255), nullable=True),
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("repo_url", sa.String(500), nullable=True),
    sa.Column("owner_id", sa.String(36), nullable=True),
    sa.Column("team_id", sa.String(36), nullable=True),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("key", sa.String(10), nullable=True),
    sa.Column("card_counter", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("is_demo", sa.Boolean(), nullable=False, server_default="0"),
    sa.Column("default_generation_style", sa.String(32), nullable=True),
    sa.Column("default_modifiers", sa.JSON(), nullable=False, server_default="[]"),
    sa.Column("reference_links", sa.JSON(), nullable=False, server_default="[]"),
    # A follow-up session opens from the one before it; the chain is what makes
    # the ledger read chronologically instead of as a folder tree.
    sa.Column("continued_from_id", sa.String(36), nullable=True),
)

#: Already carried a session id — the project column is redundant.
_DROP_PROJECT_ID = (
    ("cards", "uq_cards_project_number", "ix_cards_project_id"),
    ("blueprint_suggestions", None, None),
    ("task_generation_jobs", None, "ix_task_generation_jobs_project_status"),
    ("usage_events", None, "ix_usage_events_project_occurred"),
)

#: SQLite reflects foreign keys without names, so batch mode needs a convention
#: to address one by. See "Dropping unnamed or named foreign key constraints"
#: in the Alembic batch-mode docs.
_FK_NAMING = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}


def _fk_name(table: str, column: str, referred: str = "projects") -> str:
    return f"fk_{table}_{column}_{referred}"


#: Only ever had a project id — it becomes the session id.
_RENAME = (
    ("boards", False),
    ("blueprint_iterations", False),
    ("harness_configs", True),
    ("notifications", False),
    ("ticket_templates", False),
    ("repo_analysis_jobs", False),
    ("project_outputs", False),
    ("project_attachments", False),
)


#: (table, column, ondelete) whose foreign key is re-created against sessions
#: once every rename has landed. The ondelete is not decoration: the reflected
#: constraint is copied verbatim by batch mode, so a key re-created without one
#: leaves a migrated database behaving differently from a fresh one. Each value
#: here is the model's own. project_outputs/attachments appear under their new
#: names — the table rename happens before this pass.
_REPOINT = (
    ("blueprint_snapshots", "session_id", None),
    ("boards", "session_id", None),
    ("blueprint_iterations", "session_id", None),
    ("harness_configs", "session_id", None),
    ("notifications", "session_id", "CASCADE"),
    ("ticket_templates", "session_id", None),
    ("repo_analysis_jobs", "session_id", "CASCADE"),
    ("session_outputs", "session_id", None),
    ("session_attachments", "session_id", "CASCADE"),
    ("integration_project_mappings", "internal_session_id", "CASCADE"),
    ("teams", "last_viewed_session_id", "SET NULL"),
)

#: Indexes a fresh install gets from the models and the renames do not leave
#: behind: (name, table, columns).
_INDEXES = (
    ("ix_cards_session_id", "cards", ["session_id"]),
    ("ix_session_attachments_session_id", "session_attachments", ["session_id"]),
)

#: Index names the renames carry over from the projects era. Dropped so a
#: migrated database has the same set as a fresh one.
_STALE_INDEXES = (
    "ix_ticket_templates_project_id",
    "ix_project_attachments_project_id",
    "ix_project_attachments_session_id",
    "ix_project_outputs_session_id",
    "ix_blueprint_iterations_session_id",
    "ix_blueprint_snapshots_session_id",
    "ix_boards_session_id",
    "ix_harness_configs_session_id",
    "ix_notifications_session_id",
    "ix_repo_analysis_jobs_session_id",
)


def upgrade() -> None:
    with op.batch_alter_table("sessions", naming_convention=_FK_NAMING) as batch:
        for column in _ABSORBED:
            batch.add_column(column)
        batch.drop_column("project_id")
        batch.create_unique_constraint("uq_sessions_org_key", ["org_id", "key"])

    # A snapshot carried both ids: the project owned it, the session recorded
    # which conversation wrote it. One session is one conversation now, so the
    # owning column survives and the provenance moves to a flag.
    with op.batch_alter_table("blueprint_snapshots", naming_convention=_FK_NAMING) as batch:
        batch.drop_constraint(_fk_name("blueprint_snapshots", "project_id"), type_="foreignkey")
        batch.drop_column("session_id")
        batch.alter_column("project_id", new_column_name="session_id")
        batch.add_column(sa.Column("from_conversation", sa.Boolean(), nullable=False, server_default="0"))
    op.create_index("ix_blueprint_snapshots_session_id", "blueprint_snapshots", ["session_id"])

    for table, constraint, index in _DROP_PROJECT_ID:
        if index:
            op.execute(sa.text(f"DROP INDEX IF EXISTS {index}"))
        with op.batch_alter_table(table) as batch:
            if constraint:
                batch.drop_constraint(constraint, type_="unique")
            batch.drop_column("project_id")
    with op.batch_alter_table("cards") as batch:
        batch.create_unique_constraint("uq_cards_session_number", ["session_id", "number"])
    # The column was the nullable "which conversation raised this" and is now
    # the owner, so it loses both its nullability and the SET NULL that went
    # with being optional.
    with op.batch_alter_table("blueprint_suggestions", naming_convention=_FK_NAMING) as batch:
        batch.drop_constraint(_fk_name("blueprint_suggestions", "session_id", "sessions"), type_="foreignkey")
        batch.alter_column("session_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key("fk_blueprint_suggestions_session", "sessions", ["session_id"], ["id"])

    for table, unique in _RENAME:
        with op.batch_alter_table(table, naming_convention=_FK_NAMING) as batch:
            batch.drop_constraint(_fk_name(table, "project_id"), type_="foreignkey")
            batch.alter_column("project_id", new_column_name="session_id")
        op.create_index(
            f"ix_{table}_session_id", table, ["session_id"], unique=unique
        )
    op.execute(sa.text("DROP INDEX IF EXISTS ix_repo_analysis_jobs_project_status"))
    op.create_index("ix_repo_analysis_jobs_session_status", "repo_analysis_jobs", ["session_id", "status"])

    with op.batch_alter_table("integration_project_mappings", naming_convention=_FK_NAMING) as batch:
        batch.drop_constraint("uq_integration_project_mappings_integration_project", type_="unique")
        batch.drop_constraint(_fk_name("integration_project_mappings", "internal_project_id"), type_="foreignkey")
        batch.alter_column("internal_project_id", new_column_name="internal_session_id")
        batch.create_unique_constraint(
            "uq_integration_session_mappings_integration_session",
            ["integration_id", "internal_session_id"],
        )
    with op.batch_alter_table("teams", naming_convention=_FK_NAMING) as batch:
        batch.drop_constraint(_fk_name("teams", "last_viewed_project_id"), type_="foreignkey")
        batch.alter_column("last_viewed_project_id", new_column_name="last_viewed_session_id")

    op.rename_table("project_outputs", "session_outputs")
    op.rename_table("project_attachments", "session_attachments")

    # Second pass, once every column has settled under its new name: point the
    # renamed columns at sessions. A foreign key added in the same batch as the
    # rename that created its column is silently dropped, so it has to be here.
    for table, column, ondelete in _REPOINT:
        with op.batch_alter_table(table) as batch:
            batch.create_foreign_key(
                f"fk_{table}_{column}", "sessions", [column], ["id"], ondelete=ondelete
            )

    # The session gained columns that point somewhere; a plain add_column gave
    # them no key. use_alter on team_id mirrors the model — sessions and teams
    # reference each other.
    with op.batch_alter_table("sessions") as batch:
        batch.create_foreign_key("fk_sessions_owner_id", "users", ["owner_id"], ["id"])
        batch.create_foreign_key("fk_sessions_team_id", "teams", ["team_id"], ["id"])
        batch.create_foreign_key("fk_sessions_continued_from_id", "sessions", ["continued_from_id"], ["id"])

    for name, table, columns in _INDEXES:
        op.create_index(name, table, columns)
    for name in _STALE_INDEXES:
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))

    op.drop_table("projects")


def downgrade() -> None:
    raise NotImplementedError(
        "the project concept was removed; restore from the .bak beside planning.db"
    )
