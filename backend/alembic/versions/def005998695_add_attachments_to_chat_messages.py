"""add attachments to chat_messages

Revision ID: def005998695
Revises: fc07c98ab738
Create Date: 2026-04-02 16:59:09.920719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'def005998695'
down_revision: Union[str, Sequence[str], None] = 'fc07c98ab738'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('chat_messages', sa.Column('attachments', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chat_messages', 'attachments')
