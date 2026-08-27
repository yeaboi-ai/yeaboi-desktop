from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class SlackUserLink(TimestampMixin, Base):
    __tablename__ = "slack_user_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    slack_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    slack_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    verified_via: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (UniqueConstraint("slack_team_id", "slack_user_id", name="uq_slack_user_link"),)
