from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("org_id", "key", name="uq_projects_org_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    repo_url: Mapped[str | None] = mapped_column(String(500))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Human-friendly project key, e.g. "PROJ" — used to render ticket ids like PROJ-123.
    # Unique within org. Nullable during the backfill window after migration.
    key: Mapped[str | None] = mapped_column(String(10))
    # Per-project monotonic counter for ticket numbering. Bumped via UPDATE...RETURNING.
    card_counter: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    # Marker for the onboarding-seeded sample project. Lets us hide it from
    # plan-limit counts and surface a guided tour only on this project.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)

    # Wizard ticket-generation default. None == use the global default at run time
    # so legacy projects don't suddenly start generating with a non-balanced style.
    # Column is named for the original single-axis API; semantically it now holds
    # a granularity slug.
    default_generation_style: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 0+ default modifiers (MODIFIER_SLUGS) the wizard pre-selects. Empty list ==
    # no defaults so the wizard starts with nothing checked.
    default_modifiers: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")

    # The yeaboi engine's project row this project is a client of (proj-<8hex>,
    # minted lazily on the first engine-touching run). Soft reference — the
    # engine's sessions.db is a different database, so no FK.
    yeaboi_project_id: Mapped[str | None] = mapped_column(String(64), default=None)

    # `active` | `done`. Done means the owner marked it complete; archive and delete are separate.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active", default="active")

    owner: Mapped["User"] = relationship(back_populates="projects")  # noqa: F821
