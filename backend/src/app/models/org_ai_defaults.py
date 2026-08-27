"""Per-org AI voice/language defaults.

Provides fallback values for voice settings when a persona does not
override them.  One row per org; all fields nullable (None = use
hardcoded platform defaults).
"""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class OrgAIDefaults(TimestampMixin, Base):
    __tablename__ = "org_ai_defaults"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    voice_id: Mapped[str | None] = mapped_column(String(100))
    speed: Mapped[float | None] = mapped_column(Float)
    emotion: Mapped[str | None] = mapped_column(String(20))
    language: Mapped[str | None] = mapped_column(String(10))
    realtime_voice: Mapped[str | None] = mapped_column(String(30))
