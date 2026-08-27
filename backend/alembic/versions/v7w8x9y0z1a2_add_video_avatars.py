"""add video avatars table and persona FK

Revision ID: v7w8x9y0z1a2
Revises: f2a3b4c5d6e7
Create Date: 2026-05-03 12:00:00.000000

"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "v7w8x9y0z1a2"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Tavus phoenix-3 stock replicas paired with gender-matched ElevenLabs voices.
# Each row is a "character": picking it sets both the video avatar and the TTS
# voice so the agent always looks and sounds consistent.
SYSTEM_AVATARS = [
    {
        "name": "Anna",
        "description": "Friendly female presenter (phoenix-3)",
        "replica_id": "r6ae5b6efc9d",
        "preview_url": "https://cdn.replica.tavus.io/20266/37234b1f.mp4",
        "gender": "female",
        "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Bella — soft female
        "realtime_voice": "shimmer",
        "sort_order": 10,
    },
    {
        "name": "Charlie",
        "description": "Male presenter, studio (phoenix-3)",
        "replica_id": "rf4703150052",
        "preview_url": "https://cdn.replica.tavus.io/20260/thumbnail_video_normalized.mp4",
        "gender": "male",
        "voice_id": "pNInz6obpgDQGcFmaJgB",  # Adam — deep male
        "realtime_voice": "echo",
        "sort_order": 20,
    },
    {
        "name": "Olivia",
        "description": "Calm female presenter (phoenix-3)",
        "replica_id": "rc2146c13e81",
        "preview_url": "https://cdn.replica.tavus.io/20262/3e1d96d8.mp4",
        "gender": "female",
        "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel — calm female
        "realtime_voice": "sage",
        "sort_order": 30,
    },
    {
        "name": "Benjamin",
        "description": "Male presenter (phoenix-3)",
        "replica_id": "r1a4e22fa0d9",
        "preview_url": "https://cdn.replica.tavus.io/20269/3448746b_normalized.mp4",
        "gender": "male",
        "voice_id": "ErXwobaYiN019PkySvjV",  # Antoni — well-rounded male
        "realtime_voice": "ash",
        "sort_order": 40,
    },
    {
        "name": "Luna",
        "description": "Energetic female (phoenix-3)",
        "replica_id": "r9d30b0e55ac",
        "preview_url": "https://cdn.replica.tavus.io/20258/7202eb45.mp4",
        "gender": "female",
        "voice_id": "AZnzlk1XvdvUeBnXmlld",  # Domi — strong female
        "realtime_voice": "coral",
        "sort_order": 50,
    },
]


def upgrade() -> None:
    op.create_table(
        "video_avatars",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=False, server_default="tavus"),
        sa.Column("replica_id", sa.String(length=100), nullable=False),
        sa.Column("preview_url", sa.String(length=500), nullable=True),
        sa.Column("tavus_persona_id", sa.String(length=64), nullable=True),
        sa.Column("gender", sa.String(length=10), nullable=True),
        sa.Column("voice_id", sa.String(length=100), nullable=True),
        sa.Column("realtime_voice", sa.String(length=30), nullable=True),
        sa.Column("voice_sample_url", sa.String(length=500), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_video_avatars_org_id", "video_avatars", ["org_id"])
    op.create_index("ix_video_avatars_is_system", "video_avatars", ["is_system"])

    op.add_column(
        "blueprint_personas",
        sa.Column("video_avatar_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_blueprint_personas_video_avatar_id",
        "blueprint_personas",
        "video_avatars",
        ["video_avatar_id"],
        ["id"],
        ondelete="SET NULL",
    )

    bind = op.get_bind()
    for avatar in SYSTEM_AVATARS:
        bind.execute(
            sa.text(
                "INSERT INTO video_avatars "
                "(id, org_id, name, description, provider, replica_id, preview_url, "
                " gender, voice_id, realtime_voice, is_system, sort_order) "
                "VALUES (:id, NULL, :name, :description, 'tavus', :replica_id, :preview_url, "
                "        :gender, :voice_id, :realtime_voice, true, :sort_order)"
            ),
            {
                "id": str(uuid.uuid4()),
                "name": avatar["name"],
                "description": avatar["description"],
                "replica_id": avatar["replica_id"],
                "preview_url": avatar["preview_url"],
                "gender": avatar["gender"],
                "voice_id": avatar["voice_id"],
                "realtime_voice": avatar["realtime_voice"],
                "sort_order": avatar["sort_order"],
            },
        )


def downgrade() -> None:
    op.drop_constraint(
        "fk_blueprint_personas_video_avatar_id",
        "blueprint_personas",
        type_="foreignkey",
    )
    op.drop_column("blueprint_personas", "video_avatar_id")
    op.drop_index("ix_video_avatars_is_system", table_name="video_avatars")
    op.drop_index("ix_video_avatars_org_id", table_name="video_avatars")
    op.drop_table("video_avatars")
