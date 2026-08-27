from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class CardView(TimestampMixin, Base):
    """A user-saved board view — filters, density, swimlane snapshot.

    Owned by a user and scoped to an org so views travel with the user across
    projects but never leak across orgs. ``query`` stores a serialised URL
    search-params string so the frontend can apply it via decodeBoardUrlState
    without server-side parsing.
    """

    __tablename__ = "card_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
