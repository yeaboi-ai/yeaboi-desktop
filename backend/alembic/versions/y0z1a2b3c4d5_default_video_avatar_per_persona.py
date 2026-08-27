"""assign default video_avatar to each system persona

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-05-05 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "y0z1a2b3c4d5"
down_revision: str | None = "x9y0z1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Persona slug → VideoAvatar.name (system avatars seeded in v7w8x9y0z1a2).
PERSONA_TO_AVATAR_NAME = {
    "default": "Charlie",
    "pm": "Anna",
    "architect": "Benjamin",
    "mentor": "Olivia",
    "challenger": "Luna",
}


def upgrade() -> None:
    bind = op.get_bind()
    for slug, avatar_name in PERSONA_TO_AVATAR_NAME.items():
        bind.execute(
            sa.text(
                """
                UPDATE blueprint_personas AS bp
                SET video_avatar_id = (
                    SELECT id FROM video_avatars
                    WHERE name = :avatar_name AND is_system = true AND deleted_at IS NULL
                    LIMIT 1
                )
                WHERE bp.slug = :slug
                  AND bp.is_system = true
                  AND bp.video_avatar_id IS NULL
                """
            ),
            {"slug": slug, "avatar_name": avatar_name},
        )


def downgrade() -> None:
    # Best-effort revert: clear the avatar links we set above. We can't tell
    # which rows were nulled before this migration ran, so we only clear rows
    # that still match the (slug, avatar) mapping.
    bind = op.get_bind()
    for slug, avatar_name in PERSONA_TO_AVATAR_NAME.items():
        bind.execute(
            sa.text(
                """
                UPDATE blueprint_personas AS bp
                SET video_avatar_id = NULL
                WHERE bp.slug = :slug
                  AND bp.is_system = true
                  AND bp.video_avatar_id = (
                      SELECT id FROM video_avatars
                      WHERE name = :avatar_name AND is_system = true
                      LIMIT 1
                  )
                """
            ),
            {"slug": slug, "avatar_name": avatar_name},
        )
