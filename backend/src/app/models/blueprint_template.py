from __future__ import annotations

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid


class BlueprintPersona(TimestampMixin, Base):
    __tablename__ = "blueprint_personas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    focus_sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))

    # Deprecated — thumbnails are now derived from the linked video_avatar's
    # preview frame (or the persona slug's SVG fallback). Column kept for now
    # to avoid an immediate migration; a follow-up will drop it.
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    # Video avatar selection (nullable = no live talking-head; use static image)
    video_avatar_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("video_avatars.id", ondelete="SET NULL"))

    # Voice / language settings (nullable = inherit from org defaults)
    voice_id: Mapped[str | None] = mapped_column(String(100))
    speed: Mapped[float | None] = mapped_column(Float)
    emotion: Mapped[str | None] = mapped_column(String(20))
    language: Mapped[str | None] = mapped_column(String(10))
    realtime_voice: Mapped[str | None] = mapped_column(String(30))


class BlueprintSection(TimestampMixin, Base):
    __tablename__ = "blueprint_sections_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))


class BlueprintTemplate(TimestampMixin, Base):
    __tablename__ = "blueprint_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(30), default="zap")
    sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    default_persona_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("blueprint_personas.id", ondelete="SET NULL")
    )
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))
