from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

# Server-driven activity feed event. Renders alongside comments in the unified timeline.
EVENT_KINDS = (
    "created",
    "moved",
    "updated",
    "linked",
    "unlinked",
    "attachment_added",
    "attachment_removed",
    "template_applied",
    "agent_state",
    "synced",
    "sync_conflict",
)


class CardEvent(TimestampMixin, Base):
    """One row per system-generated activity feed event on a card.

    Comments live separately in card_comments; the activity-feed renderer merges both
    by created_at. payload carries event-specific context (e.g. {"from_column":"To Do",
    "to_column":"In Progress"} for "moved").
    """

    __tablename__ = "card_events"
    __table_args__ = (Index("ix_card_events_card_created", "card_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
