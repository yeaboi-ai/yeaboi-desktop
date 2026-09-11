"""purge every project and everything that hangs off one

Projects were removed: a session is the workspace. This deletes the rows so
the DDL revision that follows reshapes empty tables and needs no backfill.
Split from that revision on purpose — it is the one the backup guard in
local_bootstrap compares against, and the one a reader can point at when
asking where the data went.

Rows that outlive a project keep their history and lose only the link:
usage_events is a spend trail, feedback is a person's words, and an org-level
ticket template was never a project's to begin with.

Revision ID: rm01_purge_projects
Revises: k2l3m4n5o6p7
Create Date: 2026-09-10 00:00:00.000000
"""

from collections.abc import Sequence

from sqlalchemy import text

from alembic import op

revision: str = "rm01_purge_projects"
down_revision: str | Sequence[str] | None = "k2l3m4n5o6p7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Unlinked rather than deleted — each row means something without a project.
_UNLINK = (
    "UPDATE teams SET last_viewed_project_id = NULL",
    "UPDATE usage_events SET project_id = NULL, session_id = NULL",
    "UPDATE feedback SET session_id = NULL",
)

#: Child first, so a delete never trips a foreign key.
_DELETE = (
    "transcription_corrections",
    "chat_messages",
    "transcript_entries",
    "participants",
    "session_events",
    "session_context",
    "session_clips",
    "recordings",
    "slack_session_announcements",
    "sync_events",
    "card_events",
    "card_links",
    "card_external_links",
    "card_comments",
    "card_attachments",
    "cards",
    "board_columns",
    "boards",
    "card_views",
    "blueprint_suggestions",
    "blueprint_snapshots",
    "task_generation_jobs",
    "sessions",
    "blueprint_iterations",
    "project_attachments",
    "project_outputs",
    "repo_analysis_jobs",
    "harness_configs",
    "notifications",
    "integration_project_mappings",
    "projects",
)


def upgrade() -> None:
    connection = op.get_bind()
    present = set(connection.dialect.get_table_names(connection))
    for statement in _UNLINK:
        table = statement.split()[1]
        if table in present:
            connection.execute(text(statement))
    # An org-level template (project_id NULL) is nobody's project's.
    if "ticket_templates" in present:
        connection.execute(text("DELETE FROM ticket_templates WHERE project_id IS NOT NULL"))
    for table in _DELETE:
        if table in present:
            connection.execute(text(f"DELETE FROM {table}"))  # noqa: S608 - a constant list, never input


def downgrade() -> None:
    raise NotImplementedError(
        "the project concept was removed and its rows deleted; restore from the "
        ".bak beside planning.db that the upgrade wrote"
    )
