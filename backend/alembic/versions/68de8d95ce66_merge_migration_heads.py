"""merge migration heads

Revision ID: 68de8d95ce66
Revises: a1b2c3d4e5f6, g2h3i4j5k6l7
Create Date: 2026-03-18 17:29:11.196141

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "68de8d95ce66"
down_revision: str | Sequence[str] | None = ("a1b2c3d4e5f6", "g2h3i4j5k6l7")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
