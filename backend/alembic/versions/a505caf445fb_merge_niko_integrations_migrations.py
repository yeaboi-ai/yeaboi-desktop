"""merge niko + integrations migrations

Revision ID: a505caf445fb
Revises: be3835584436, k6l7m8n9o0p1
Create Date: 2026-04-06 11:24:50.085040

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a505caf445fb'
down_revision: Union[str, Sequence[str], None] = ('be3835584436', 'k6l7m8n9o0p1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
