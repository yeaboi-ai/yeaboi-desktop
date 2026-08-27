"""add project_outputs table and backfill from harness_configs

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-04-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "t5u6v7w8x9y0"
down_revision: str | None = "s4t5u6v7w8x9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_outputs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("output_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="not_generated"),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("artifacts", sa.JSON, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "output_type", name="uq_project_outputs_type"),
    )
    op.create_index("ix_project_outputs_project_id", "project_outputs", ["project_id"])

    # Backfill: every existing harness_configs row -> project_outputs row with output_type='code_scaffold'.
    # Map status values: pending->not_generated, generating->generating, complete->ready, failed->failed.
    # Postgres-specific (json_build_object); tests use Base.metadata.create_all against SQLite so migrations
    # don't execute there. Gate by dialect anyway to keep this safe if that changes.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(
            sa.text(
                """
                INSERT INTO project_outputs (id, project_id, output_type, status, payload, artifacts, error,
                                              created_at, updated_at)
                SELECT
                    hc.id,
                    hc.project_id,
                    'code_scaffold',
                    CASE hc.status
                        WHEN 'pending' THEN 'not_generated'
                        WHEN 'generating' THEN 'generating'
                        WHEN 'complete' THEN 'ready'
                        WHEN 'failed' THEN 'failed'
                        ELSE 'not_generated'
                    END,
                    CASE WHEN hc.template_overrides IS NULL OR hc.template_overrides::text = '{}' THEN NULL
                         ELSE hc.template_overrides END,
                    CASE
                        WHEN hc.repo_url IS NOT NULL OR hc.repo_name IS NOT NULL
                        THEN json_build_object('repo_name', hc.repo_name, 'repo_url', hc.repo_url,
                                                'repo_provider', hc.repo_provider)
                        ELSE NULL
                    END,
                    NULL,
                    hc.created_at,
                    hc.updated_at
                FROM harness_configs hc
                """
            )
        )


def downgrade() -> None:
    op.drop_index("ix_project_outputs_project_id", table_name="project_outputs")
    op.drop_table("project_outputs")
