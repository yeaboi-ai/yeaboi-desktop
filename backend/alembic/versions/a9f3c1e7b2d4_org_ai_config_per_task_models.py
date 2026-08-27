"""org_ai_config: per-task model overrides (flow / arch / wireframe)

Adds nullable model-override columns so an org can pick which model powers
each heavy generation task (user-flow diagrams, cloud architecture diagrams,
UI/mockup wireframes) from the Settings UI. Null preserves the existing
role-default behaviour in services/ai_provider.py.

Revision ID: a9f3c1e7b2d4
Revises: c9d0e1f2a3b4
Create Date: 2026-05-23
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a9f3c1e7b2d4"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("org_ai_config", sa.Column("flow_model", sa.String(length=100), nullable=True))
    op.add_column("org_ai_config", sa.Column("arch_model", sa.String(length=100), nullable=True))
    op.add_column("org_ai_config", sa.Column("wireframe_model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("org_ai_config", "wireframe_model")
    op.drop_column("org_ai_config", "arch_model")
    op.drop_column("org_ai_config", "flow_model")
