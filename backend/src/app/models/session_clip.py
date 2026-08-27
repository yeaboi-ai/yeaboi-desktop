from __future__ import annotations

from datetime import datetime
from secrets import token_urlsafe

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


def _gen_share_token() -> str:
    """16-byte URL-safe token. Collision probability is negligible at our scale."""
    return token_urlsafe(16)[:24]


class SessionClip(TimestampMixin, Base):
    """W6.6.2 — A shareable transcript slice from a session.

    Text-only for now; audio storage will land in a follow-up that wires
    S3-equiv durable storage. The frontend renders the transcript inline
    so links are immediately useful.
    """

    __tablename__ = "session_clips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    share_token: Mapped[str] = mapped_column(String(24), unique=True, default=_gen_share_token, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transcript: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    start_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
