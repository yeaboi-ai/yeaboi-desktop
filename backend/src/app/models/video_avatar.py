from __future__ import annotations

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class VideoAvatar(TimestampMixin, Base):
    """A character: bundles a video replica with a matched voice.

    Picking a character in the studio sets BOTH the visual avatar and the TTS
    voice for that persona — so a male character always sounds male, a female
    character sounds female. Per-persona voice fields can still override but
    by default are inherited from the chosen character.
    """

    __tablename__ = "video_avatars"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # Nullable org_id = system-wide character visible to every org
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="tavus")
    replica_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # Tavus persona pre-configured with this character's TTS voice.
    # Tavus uses ElevenLabs under the hood for replica voices, so the persona
    # tells Tavus which ElevenLabs voice to use — keeping studio renders and
    # live calls in sync. Pass this alongside replica_id to /v2/videos and
    # /v2/conversations.
    tavus_persona_id: Mapped[str | None] = mapped_column(String(64))
    preview_url: Mapped[str | None] = mapped_column(String(500))

    # Bundled voice — applies during voice calls so video and audio match
    gender: Mapped[str | None] = mapped_column(String(10))  # "male" / "female" / "neutral"
    voice_id: Mapped[str | None] = mapped_column(String(100))  # ElevenLabs voice id
    realtime_voice: Mapped[str | None] = mapped_column(String(30))  # OpenAI Realtime voice name
    # Short ElevenLabs intro clip the studio plays on click so users hear the voice
    voice_sample_url: Mapped[str | None] = mapped_column(String(500))

    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
