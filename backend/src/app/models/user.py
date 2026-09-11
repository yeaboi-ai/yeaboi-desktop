from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    display_name: Mapped[str | None] = mapped_column(String(100))
    invite_token: Mapped[str | None] = mapped_column(String(36), unique=True, nullable=True)
    invite_claimed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    role: Mapped[str] = mapped_column(String(20), default="member", server_default="member")
    pronouns: Mapped[str | None] = mapped_column(String(40))
    job_title: Mapped[str | None] = mapped_column(String(100))
    bio: Mapped[str | None] = mapped_column(String(280))
    timezone: Mapped[str | None] = mapped_column(String(64))
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tour_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intended_use: Mapped[str | None] = mapped_column(Text)

    sessions: Mapped[list["Session"]] = relationship(back_populates="owner")  # noqa: F821
