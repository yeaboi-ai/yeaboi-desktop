from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

# Canonical link types stored in the source→target direction.
# blocks/blocked_by are inverses of each other; we store the "blocks" direction
# canonically (source blocks target) and render the inverse on read.
LINK_TYPES = ("blocks", "relates_to", "duplicates", "parent_of")


class CardLink(TimestampMixin, Base):
    """Typed relationship between two cards.

    Stored canonically: e.g. for a "blocked by" relationship, source is the blocker
    and target is the blockee, link_type='blocks'. The frontend inverts on read.
    relates_to is symmetric — surface the link from both sides regardless of which
    was the source on insert.
    """

    __tablename__ = "card_links"
    __table_args__ = (
        UniqueConstraint("source_card_id", "target_card_id", "link_type", name="uq_card_link_triple"),
        CheckConstraint("source_card_id <> target_card_id", name="ck_card_link_no_self"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    source_card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_card_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
