"""add upstream_status_url to status_components and backfill known vendors

Adds a display-only column linking a component to its vendor's own statuspage
(e.g. anthropic → status.anthropic.com). This is distinct from
``third_party_status_url`` — that column already drives the third-party feed
loop as the probe source. ``upstream_status_url`` is never probed; it's used
for the "↗ status.vendor.com" link on the public page and for lazily fetching
the vendor's unresolved-incident list.

Revision ID: d7e8f9a0b1c2
Revises: c5d6e7f8a9b0
Create Date: 2026-05-18 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Vendors with a statuspage.io-style page. Used for the "↗" link and for
# fetching unresolved incidents to inline on the public row. Google Cloud
# (gemini/google) is intentionally link-only on this pass — its incidents.json
# shape differs from statuspage.io, not worth a second parser yet.
_UPSTREAM_URLS: dict[str, str] = {
    "anthropic": "https://status.anthropic.com",
    "openai": "https://status.openai.com",
    "deepgram": "https://status.deepgram.com",
    "elevenlabs": "https://status.elevenlabs.io",
    "livekit": "https://status.livekit.io",
    "gemini": "https://status.cloud.google.com",
    "google": "https://status.cloud.google.com",
}


def upgrade() -> None:
    op.add_column(
        "status_components",
        sa.Column("upstream_status_url", sa.String(length=500), nullable=True),
    )
    components = sa.table(
        "status_components",
        sa.column("key", sa.String),
        sa.column("upstream_status_url", sa.String),
    )
    for key, url in _UPSTREAM_URLS.items():
        op.execute(
            components.update().where(components.c.key == op.inline_literal(key)).values(upstream_status_url=url)
        )


def downgrade() -> None:
    op.drop_column("status_components", "upstream_status_url")
