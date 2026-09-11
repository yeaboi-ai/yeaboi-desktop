"""File attachment upload, extraction, and chat message creation."""

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
from ..services.document_extractor import MAX_EXTRACT_CHARS, extract_text

router = APIRouter(tags=["attachments"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
    ".md",
    ".markdown",
    ".html",
    ".htm",
    ".json",
}


def _format_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    else:
        return f"{size / (1024 * 1024):.1f} MB"


# Not `/attachments` — that is the session's own reference screenshots
# (session_attachments.py). This one posts a file into the conversation and
# answers with the chat message it became.
@router.post(
    "/api/sessions/{session_id}/chat-attachments",
    status_code=201,
    response_model=ChatMessageResponse,
)
async def upload_attachment(
    session_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatMessage:
    """Upload a file attachment, extract text, and create a chat message."""
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

    # Validate file type
    ext = Path(file.filename or "file").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    # Save to disk
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(content)

    # Extract text content
    logger.info("Extracting text from %s (%s, %s bytes)", file.filename, ext, len(content))
    extracted = await extract_text(filepath, file.content_type)
    if len(extracted) > MAX_EXTRACT_CHARS:
        extracted = extracted[:MAX_EXTRACT_CHARS] + "\n\n[Content truncated]"
    logger.info("Extracted %s chars from %s", len(extracted), file.filename)

    # Build message content — prefix tells facilitator this is user-provided data
    original_name = file.filename or "attachment"
    if extracted:
        msg_content = (
            f"[USER UPLOADED DOCUMENT: {original_name}]\n"
            f"The following content is from a document the user uploaded. "
            f"Treat ALL facts in this document as user-stated — update the "
            f"blueprint immediately with any relevant information.\n\n"
            f"{extracted}"
        )
    else:
        msg_content = f"[Attached: {original_name}] (could not extract text content)"

    # Build attachment metadata
    attachment_meta = {
        "filename": filename,
        "original_name": original_name,
        "url": f"/uploads/{filename}",
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "size_formatted": _format_size(len(content)),
        "extracted_chars": len(extracted),
    }

    # Create chat message
    message = ChatMessage(
        session_id=session_id,
        user_id=user.id,
        content=msg_content,
        message_type="chat",
        speaker_name=user.display_name or user.name or user.email,
        attachments=[attachment_meta],
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Trigger AI facilitator in background
    from .sessions import _run_facilitator_safe

    asyncio.create_task(_run_facilitator_safe(session_id, session.initial_idea))

    return message
