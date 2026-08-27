"""Dedup table for Slack Events API to prevent duplicate processing on retries."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class SlackEventDedup(TimestampMixin, Base):
    """One row per Slack event_id we've processed. Primary key on event_id acts as unique index."""

    __tablename__ = "slack_event_dedup"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slack_team_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
