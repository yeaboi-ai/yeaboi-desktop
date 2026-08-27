"""add smart transcription and vocabulary learning

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-04-11 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "n9o0p1q2r3s4"
down_revision: str | Sequence[str] | None = "m8n9o0p1q2r3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ChatMessage: store raw ASR output and enhancement flag
    op.add_column("chat_messages", sa.Column("original_content", sa.Text(), nullable=True))
    op.add_column(
        "chat_messages", sa.Column("is_enhanced", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )

    # TranscriptEntry: store raw ASR output
    op.add_column("transcript_entries", sa.Column("original_text", sa.Text(), nullable=True))

    # Vocabulary entries — learned terms dictionary
    op.create_table(
        "vocabulary_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("canonical_form", sa.String(500), nullable=False),
        sa.Column("category", sa.String(50), server_default="general", nullable=False),
        sa.Column("phonetic_hint", sa.String(500), nullable=True),
        sa.Column("boost_weight", sa.Float(), server_default="1.5", nullable=False),
        sa.Column("source", sa.String(30), server_default="correction", nullable=False),
        sa.Column("usage_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_vocab_org_user", "vocabulary_entries", ["org_id", "user_id"])
    op.create_index("ix_vocab_org_canonical", "vocabulary_entries", ["org_id", "canonical_form"])

    # Vocabulary variants — maps wrong transcriptions to correct form
    op.create_table(
        "vocabulary_variants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "entry_id", sa.String(36), sa.ForeignKey("vocabulary_entries.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("variant_text", sa.String(500), nullable=False),
        sa.Column("variant_lower", sa.String(500), nullable=False),
        sa.Column("confidence", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("occurrence_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_variant_lower", "vocabulary_variants", ["variant_lower"])

    # Transcription corrections — audit log
    op.create_table(
        "transcription_corrections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("chat_messages.id"), nullable=True),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("corrected_text", sa.Text(), nullable=False),
        sa.Column("corrections_json", sa.JSON(), nullable=True),
        sa.Column("auto_detected", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Voice profiles — per-user voice training results
    op.create_table(
        "voice_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("sample_results", sa.JSON(), nullable=True),
        sa.Column("accent_detected", sa.String(20), nullable=True),
        sa.Column("training_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("voice_profiles")
    op.drop_table("transcription_corrections")
    op.drop_table("vocabulary_variants")
    op.drop_index("ix_vocab_org_canonical", "vocabulary_entries")
    op.drop_index("ix_vocab_org_user", "vocabulary_entries")
    op.drop_table("vocabulary_entries")
    op.drop_column("transcript_entries", "original_text")
    op.drop_column("chat_messages", "is_enhanced")
    op.drop_column("chat_messages", "original_content")
