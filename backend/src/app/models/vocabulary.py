"""Vocabulary learning models — stores learned terms from transcription corrections."""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, gen_uuid


class VocabularyEntry(TimestampMixin, Base):
    """A learned term — the canonical (correct) form of a word or phrase."""

    __tablename__ = "vocabulary_entries"
    __table_args__ = (
        Index("ix_vocab_org_user", "org_id", "user_id"),
        Index("ix_vocab_org_canonical", "org_id", "canonical_form"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    canonical_form: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="general")
    phonetic_hint: Mapped[str | None] = mapped_column(String(500), nullable=True)
    boost_weight: Mapped[float] = mapped_column(Float, default=1.5)
    source: Mapped[str] = mapped_column(String(30), default="correction")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    variants: Mapped[list[VocabularyVariant]] = relationship(back_populates="entry", cascade="all, delete-orphan")


class VocabularyVariant(TimestampMixin, Base):
    """A known wrong transcription of a vocabulary entry."""

    __tablename__ = "vocabulary_variants"
    __table_args__ = (Index("ix_variant_lower", "variant_lower"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entry_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vocabulary_entries.id", ondelete="CASCADE"), nullable=False
    )
    variant_text: Mapped[str] = mapped_column(String(500), nullable=False)
    variant_lower: Mapped[str] = mapped_column(String(500), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)

    entry: Mapped[VocabularyEntry] = relationship(back_populates="variants")


class TranscriptionCorrection(TimestampMixin, Base):
    """Audit log of every transcript correction made by users."""

    __tablename__ = "transcription_corrections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("chat_messages.id"), nullable=True)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    corrected_text: Mapped[str] = mapped_column(Text, nullable=False)
    corrections_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    auto_detected: Mapped[bool] = mapped_column(Boolean, default=True)
