"""add session_id to blueprint_snapshots

Revision ID: fc07c98ab738
Revises: 39ee843dedbc
Create Date: 2026-04-02 12:46:18.714175

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fc07c98ab738'
down_revision: Union[str, Sequence[str], None] = '39ee843dedbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('blueprint_snapshots', sa.Column('session_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_blueprint_snapshots_session_id',
        'blueprint_snapshots', 'sessions',
        ['session_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_blueprint_snapshots_session_id', 'blueprint_snapshots', type_='foreignkey')
    op.drop_column('blueprint_snapshots', 'session_id')
