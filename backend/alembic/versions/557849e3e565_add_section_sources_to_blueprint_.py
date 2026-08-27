"""add section_sources to blueprint_snapshots

Revision ID: 557849e3e565
Revises: def005998695
Create Date: 2026-04-03 07:06:06.382875

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '557849e3e565'
down_revision: Union[str, Sequence[str], None] = 'def005998695'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('blueprint_snapshots', sa.Column('section_sources', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('blueprint_snapshots', 'section_sources')
