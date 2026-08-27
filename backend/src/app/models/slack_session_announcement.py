"""Records where a session-created Block Kit message was posted on Slack.

Lets us clean up the "Open session" button (via chat.delete) when the session
is deleted so users don't click into a dead URL.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, gen_uuid


class SlackSessionAnnouncement(Base):
    __tablename__ = "slack_session_announcements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    channel_id: Mapped[str] = mapped_column(String(64), nullable=False)
    message_ts: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
