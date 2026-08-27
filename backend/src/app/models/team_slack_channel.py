from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid
from .organization import Team


class TeamSlackChannel(TimestampMixin, Base):
    __tablename__ = "team_slack_channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slack_channel_id: Mapped[str] = mapped_column(String(64), nullable=False)
    slack_channel_name: Mapped[str | None] = mapped_column(String(255))
    event_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    team: Mapped[Team] = relationship()

    __table_args__ = (UniqueConstraint("team_id", "slack_channel_id", name="uq_team_slack_channel"),)
