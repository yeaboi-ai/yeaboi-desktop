"""Voice note upload, transcription, and chat message creation."""

import asyncio
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models.session import ChatMessage, Session
from ..models.user import User
from ..schemas.session import ChatMessageResponse
from ..services.transcript_enhancer import TranscriptContext, enhance_transcript
from ..services.transcription_service import transcribe_audio_multipass
from ..services.vocabulary_service import get_vocabulary_for_transcription

router = APIRouter(tags=["voice-notes"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/api/sessions/{session_id}/voice-notes", status_code=201, response_model=ChatMessageResponse)
async def upload_voice_note(
    session_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatMessage:
    """Upload a voice note, transcribe it, and create a chat message."""
    # Validate session
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "live":
        raise HTTPException(status_code=400, detail="Session is not live")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Read and validate file
    content = await file.read()
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file too large (max 10MB)")

    # Save to disk
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "voice.webm").suffix or ".webm"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(content)

    # Load vocabulary for this org/user (learned corrections, custom terms)
    vocabulary = await get_vocabulary_for_transcription(session.org_id, user.id, db)

    # Transcribe with vocabulary hints
    logger.info("Transcribing voice note %s (%s bytes)", filename, len(content))
    raw_transcript = await transcribe_audio_multipass(
        filepath,
        keyterms=vocabulary.to_deepgram_keyterms() if vocabulary.entries else None,
        whisper_prompt=vocabulary.to_whisper_prompt() if vocabulary.entries else None,
    )
    logger.info("Transcription result: %s", raw_transcript[:100])

    # Enhance transcript with LLM post-processing (filler removal, self-correction, punctuation)
    ctx = TranscriptContext(
        session_topic=session.initial_idea,
        speaker_name=user.display_name or user.name or user.email,
        vocabulary_hints=vocabulary.to_enhancement_context(),
    )
    enhanced = await enhance_transcript(raw_transcript, context=ctx)

    # Create chat message with audio URL
    message = ChatMessage(
        session_id=session_id,
        user_id=user.id,
        content=enhanced.enhanced_text,
        original_content=enhanced.raw_text if enhanced.was_enhanced else None,
        is_enhanced=enhanced.was_enhanced,
        message_type="chat",
        speaker_name=user.display_name or user.name or user.email,
        audio_url=f"/uploads/{filename}",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Trigger AI facilitator in background
    from .sessions import _run_facilitator_safe

    asyncio.create_task(_run_facilitator_safe(session_id, session.initial_idea))

    return message
