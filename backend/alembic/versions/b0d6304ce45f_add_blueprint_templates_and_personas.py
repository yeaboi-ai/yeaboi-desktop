"""add_blueprint_templates_and_personas

Revision ID: b0d6304ce45f
Revises: 1342dbedf90a
Create Date: 2026-04-05 11:55:43.644365

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b0d6304ce45f'
down_revision: Union[str, Sequence[str], None] = '1342dbedf90a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('blueprint_personas',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('org_id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('system_prompt', sa.Text(), nullable=False),
    sa.Column('focus_sections', sa.JSON(), nullable=False),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_blueprint_personas_org_id_slug', 'blueprint_personas', ['org_id', 'slug'], unique=True)

    op.create_table('blueprint_templates',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('org_id', sa.String(length=36), nullable=False),
    sa.Column('slug', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('icon', sa.String(length=30), nullable=False),
    sa.Column('sections', sa.JSON(), nullable=False),
    sa.Column('default_persona_id', sa.String(length=36), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['default_persona_id'], ['blueprint_personas.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_blueprint_templates_org_id_slug', 'blueprint_templates', ['org_id', 'slug'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_blueprint_templates_org_id_slug', table_name='blueprint_templates')
    op.drop_table('blueprint_templates')
    op.drop_index('ix_blueprint_personas_org_id_slug', table_name='blueprint_personas')
    op.drop_table('blueprint_personas')
