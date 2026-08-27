from __future__ import annotations

from datetime import datetime
from secrets import token_urlsafe

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


def _gen_share_token() -> str:
    return token_urlsafe(16)[:24]


# Lifecycle states emitted by LiveKit Egress, mirrored on the row.
# starting → active → completed | failed; expired is set by the sweeper.
RECORDING_STATUSES = ("starting", "active", "completed", "failed", "expired")


class Recording(TimestampMixin, Base):
    """A LiveKit Egress room-composite recording of a single call.

    One row per egress. Created when a participant starts the call (gated by
    consent); updated by the LiveKit webhook when egress ends. Playback URLs
    are minted on demand (signed, short-lived) — `file_url` is the durable
    LiveKit Cloud asset reference, not directly usable in a <video> tag.
    """

    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    started_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    egress_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    room_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="starting")
    file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    share_token: Mapped[str | None] = mapped_column(String(24), unique=True, nullable=True)
