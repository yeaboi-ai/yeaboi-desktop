"""Add org_ai_config table

Revision ID: a1b2c3d4e5f7
Revises: d19132f5672b
Create Date: 2026-03-26 17:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "d19132f5672b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "org_ai_config",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
        ),
        sa.Column("provider", sa.String(50), nullable=False, server_default="platform"),
        sa.Column("byok_provider", sa.String(50), nullable=True),
        sa.Column("byok_api_key", sa.Text(), nullable=True),
        sa.Column("bedrock_role_arn", sa.String(255), nullable=True),
        sa.Column("bedrock_region", sa.String(20), nullable=True),
        sa.Column("bedrock_model", sa.String(100), nullable=True),
        sa.Column("self_hosted_url", sa.String(500), nullable=True),
        sa.Column("self_hosted_model", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_org_ai_config_org_id", "org_ai_config", ["org_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_org_ai_config_org_id", table_name="org_ai_config")
    op.drop_table("org_ai_config")
