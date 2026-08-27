"""add model routing columns to org_ai_config

Revision ID: b8c1d2e3f4a5
Revises: c1a7f6e8d2b4
Create Date: 2026-05-16 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8c1d2e3f4a5"
down_revision: str | None = "c1a7f6e8d2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("org_ai_config", sa.Column("byok_default_model", sa.String(100), nullable=True))
    op.add_column("org_ai_config", sa.Column("byok_fast_model", sa.String(100), nullable=True))
    op.add_column("org_ai_config", sa.Column("bedrock_fast_model", sa.String(100), nullable=True))
    op.add_column("org_ai_config", sa.Column("self_hosted_fast_model", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("org_ai_config", "self_hosted_fast_model")
    op.drop_column("org_ai_config", "bedrock_fast_model")
    op.drop_column("org_ai_config", "byok_fast_model")
    op.drop_column("org_ai_config", "byok_default_model")
