from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, gen_uuid


class SessionEvent(Base):
    """Append-only event log for session context tracking."""

    __tablename__ = "session_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # Valid values: message, voice_transcript, diagram_update, wireframe_generated,
    #               blueprint_edit, decision, canvas_sync, system
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    # Valid values: chat, voice, facilitator, canvas_ws, system
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_session_events_session_id", "session_id"),)


class SessionContext(Base):
    """Materialised context directory — one row per session, upserted on change."""

    __tablename__ = "session_context"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False)
    directory: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    summary: Mapped[str | None] = mapped_column(Text)
    summary_through_event_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("session_events.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("session_id", name="uq_session_context_session_id"),)
