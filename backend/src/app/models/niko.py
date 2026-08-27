from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class NikoConversation(TimestampMixin, Base):
    __tablename__ = "niko_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship()  # noqa: F821
    messages: Mapped[list[NikoMessage]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="NikoMessage.created_at"
    )


class NikoMessage(TimestampMixin, Base):
    __tablename__ = "niko_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("niko_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant
    content: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[list | None] = mapped_column(JSON, default=None)
    tool_results: Mapped[list | None] = mapped_column(JSON, default=None)
    context_snapshot: Mapped[dict | None] = mapped_column(JSON, default=None)

    conversation: Mapped[NikoConversation] = relationship(back_populates="messages")
