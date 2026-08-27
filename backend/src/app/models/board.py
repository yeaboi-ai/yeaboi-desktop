from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class Board(TimestampMixin, Base):
    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    iteration_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("blueprint_iterations.id"))

    columns: Mapped[list[BoardColumn]] = relationship(
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="BoardColumn.position",
    )


class BoardColumn(TimestampMixin, Base):
    __tablename__ = "board_columns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    board_id: Mapped[str] = mapped_column(String(36), ForeignKey("boards.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    wip_limit: Mapped[int | None] = mapped_column(Integer)

    # Lifecycle role flags. The orchestrator uses these instead of column names so
    # boards can be renamed without breaking the agent pipeline.
    is_start_state: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_done_state: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    agent_trigger_state: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    agent_review_state: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    accent_color: Mapped[str | None] = mapped_column(String(7))  # "#RRGGBB"

    board: Mapped[Board] = relationship(back_populates="columns")
    cards: Mapped[list[Card]] = relationship(
        back_populates="column",
        cascade="all, delete-orphan",
        order_by="Card.position",
    )


class Card(TimestampMixin, Base):
    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint("project_id", "number", name="uq_cards_project_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    column_id: Mapped[str] = mapped_column(String(36), ForeignKey("board_columns.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(String(20))  # critical/high/medium/low
    story_points: Mapped[int | None] = mapped_column(Integer)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    labels: Mapped[list] = mapped_column(JSON, default=list)
    acceptance_criteria: Mapped[list] = mapped_column(JSON, default=list)
    parent_card_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("cards.id"))
    depends_on: Mapped[list] = mapped_column(JSON, default=list)  # list of card IDs this card depends on
    related_to: Mapped[list] = mapped_column(JSON, default=list)  # soft links — same area, no ordering
    wave: Mapped[int | None] = mapped_column(Integer)  # 0-indexed parallel-execution band
    sequence: Mapped[int | None] = mapped_column(Integer)  # stable order within a wave; powers exec_label suffix
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    agent_status: Mapped[str | None] = mapped_column(String(20))  # see state_machine.py
    agent_pr_url: Mapped[str | None] = mapped_column(String(500))
    agent_branch: Mapped[str | None] = mapped_column(String(255))
    agent_log: Mapped[list] = mapped_column(JSON, default=list)

    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"))

    # Denormalized FK to projects so friendly_id rendering and per-project counters
    # don't need a 3-table join through BoardColumn → Board → project_id every time.
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"), index=True)
    # Per-project monotonic ticket number. Stored alongside friendly_id for indexability.
    number: Mapped[int | None] = mapped_column(Integer, index=True)
    # Denormalized "PROJ-123". Frozen at create-time and unique-indexed for typeahead/deep-link lookup.
    friendly_id: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)

    # Ticket template that produced this card. template_version is frozen at generation
    # so prompt edits don't retroactively change cards.
    template_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ticket_templates.id", ondelete="SET NULL")
    )
    template_version: Mapped[int | None] = mapped_column(Integer)
    custom_fields: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")

    column: Mapped[BoardColumn] = relationship(back_populates="cards")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])  # noqa: F821

    @property
    def assignee_name(self) -> str | None:
        return self.assignee.name if self.assignee else None

    @property
    def assignee_email(self) -> str | None:
        return self.assignee.email if self.assignee else None

    children: Mapped[list[Card]] = relationship(
        back_populates="parent",
        foreign_keys=[parent_card_id],
    )
    parent: Mapped[Card | None] = relationship(
        back_populates="children",
        foreign_keys=[parent_card_id],
        remote_side=[id],
    )


class CardComment(TimestampMixin, Base):
    __tablename__ = "card_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    card_id: Mapped[str] = mapped_column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped[User] = relationship()  # noqa: F821
