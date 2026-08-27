"""Voice profile model — stores voice training results for per-user transcription improvement."""

from __future__ import annotations

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class VoiceProfile(TimestampMixin, Base):
    """Stores a user's voice training results for improved transcription accuracy."""

    __tablename__ = "voice_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, unique=True)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    sample_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    accent_detected: Mapped[str | None] = mapped_column(String(20), nullable=True)
    training_completed_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
