"""Team directory entries — structured knowledge base per team.

Tree of markdown entries representing a team's technical ecosystem:
stack, patterns, infrastructure, security, costs.
"""

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class DirectoryEntry(Base, TimestampMixin):
    __tablename__ = "directory_entries"
    __table_args__ = (
        UniqueConstraint("team_id", "path", name="uq_directory_team_path"),
        Index("ix_directory_team_category", "team_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("directory_entries.id", ondelete="SET NULL"), nullable=True
    )

    path: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. "frontend/design-system"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # 1-2 sentence AI summary extracted at scan time (first bold line of content,
    # or first non-empty line as fallback). Stored so /directory/tree can return
    # it without re-parsing every entry's content on each request.
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # frontend/backend/infra/security/services/costs/overview
    source: Mapped[str] = mapped_column(
        String(50), default="manual", nullable=False
    )  # scan/manual/questionnaire/blueprint

    scan_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pending/scanning/complete/failed
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA-256 for diffing
    integration_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("org_integrations.id", ondelete="SET NULL"), nullable=True
    )
    source_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)  # e.g. remote path/URL in source system

    # Self-referential relationship for tree
    children = relationship(
        "DirectoryEntry",
        backref="parent",
        remote_side="DirectoryEntry.id",
        cascade="all, delete-orphan",
        single_parent=True,
        foreign_keys="DirectoryEntry.parent_id",
    )
