"""partial unique indexes on generation_* tables (active rows only)

Revision ID: g8h9i0j1k2l3
Revises: f6a7b8c9d0e1
Create Date: 2026-06-27 15:00:00.000000

The 3-column UniqueConstraint (org_id, slug, deleted_at) we shipped is
ineffective in Postgres because NULL != NULL — two active rows (deleted_at
IS NULL) with the same slug both pass the constraint. Only the TOCTOU-racy
app-level pre-check stops a duplicate.

Drop the broken 3-col constraints and replace with partial unique indexes
that filter on deleted_at IS NULL, so the DB actually enforces active-row
uniqueness. The old constraint covered deleted rows too — we deliberately
don't preserve that because soft-deleted rows benefit from being able to
re-share a slug with a fresh active row.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g8h9i0j1k2l3"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLES = (
    ("generation_presets", "uq_generation_presets_org_slug", "uq_generation_presets_org_slug_active"),
    ("generation_granularities", "uq_generation_granularities_org_slug", "uq_generation_granularities_org_slug_active"),
    ("generation_modifiers", "uq_generation_modifiers_org_slug", "uq_generation_modifiers_org_slug_active"),
)


def upgrade() -> None:
    for table, old_constraint, new_index in _TABLES:
        op.drop_constraint(old_constraint, table, type_="unique")
        op.create_index(
            new_index,
            table,
            ["org_id", "slug"],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )


def downgrade() -> None:
    for table, old_constraint, new_index in _TABLES:
        op.drop_index(new_index, table_name=table)
        op.create_unique_constraint(
            old_constraint,
            table,
            ["org_id", "slug", "deleted_at"],
        )
