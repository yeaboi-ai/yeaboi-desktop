from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class CharacterVideoPreview(TimestampMixin, Base):
    """Lazy cache of Tavus-rendered intro videos for a (character, persona) pair.

    Fresh combinations trigger a Tavus generation (~1-2 min). The first POST
    creates the row with status='generating' and stores the Tavus video_id.
    A subsequent POST polls Tavus, flips status to 'ready' and saves video_url
    when generation completes. Frontend polls the same endpoint until ready.
    """

    __tablename__ = "character_video_previews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # SHA1 of (character_id, lowercase persona_name) — stable lookup key
    cache_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("video_avatars.id", ondelete="CASCADE"), nullable=False
    )
    persona_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # 'generating' | 'ready' | 'error'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="generating")
    tavus_video_id: Mapped[str | None] = mapped_column(String(64))
    video_url: Mapped[str | None] = mapped_column(String(1024))
    error_message: Mapped[str | None] = mapped_column(Text)
