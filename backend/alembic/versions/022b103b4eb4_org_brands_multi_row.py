"""org brands multi-row

Revision ID: 022b103b4eb4
Revises: 51b8a10703fd
Create Date: 2026-05-10 11:10:08.649741

Allow multiple ``org_brands`` rows per organization. Adds ``name`` and
``is_active`` columns and drops the unique constraint on ``org_id``.

Backfill semantics: existing single rows get ``name`` derived from
``app_name`` (falling back to "Brand") and ``is_active = true`` so each
org's previously-visible branding stays active.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "022b103b4eb4"
down_revision: str | Sequence[str] | None = "51b8a10703fd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add `name` as nullable, backfill, then enforce NOT NULL.
    op.add_column("org_brands", sa.Column("name", sa.String(length=100), nullable=True))
    op.execute(
        "UPDATE org_brands SET name = "
        "CASE WHEN app_name IS NOT NULL AND app_name <> '' THEN app_name ELSE 'Brand' END"
    )
    op.alter_column("org_brands", "name", existing_type=sa.String(length=100), nullable=False)

    # 2. Add `is_active` with default false, backfill existing rows to true
    #    so each org's previously-visible branding stays active.
    op.add_column(
        "org_brands",
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.execute("UPDATE org_brands SET is_active = true")

    # 3. Drop the org_id unique constraint so multiple rows per org are
    #    permitted. (Constraint name follows Postgres' default for unique
    #    column constraints.)
    op.drop_constraint("org_brands_org_id_key", "org_brands", type_="unique")


def downgrade() -> None:
    """Re-create the unique constraint and drop new columns.

    Destructive when an org has > 1 brand row — the unique constraint
    will fail to apply. Operators must collapse to a single row first.
    """
    op.create_unique_constraint("org_brands_org_id_key", "org_brands", ["org_id"])
    op.drop_column("org_brands", "is_active")
    op.drop_column("org_brands", "name")
