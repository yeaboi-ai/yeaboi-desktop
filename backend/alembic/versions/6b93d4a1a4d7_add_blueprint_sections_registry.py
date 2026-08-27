"""add_blueprint_sections_registry

Revision ID: 6b93d4a1a4d7
Revises: b0d6304ce45f
Create Date: 2026-04-06 06:14:24.665941

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b93d4a1a4d7'
down_revision: Union[str, Sequence[str], None] = 'b0d6304ce45f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('blueprint_sections_registry',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('org_id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=50), nullable=False),
    sa.Column('label', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_blueprint_sections_registry_org_id_slug', 'blueprint_sections_registry', ['org_id', 'slug'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_blueprint_sections_registry_org_id_slug', table_name='blueprint_sections_registry')
    op.drop_table('blueprint_sections_registry')
