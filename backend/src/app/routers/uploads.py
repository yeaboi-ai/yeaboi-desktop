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
from ..models.session import Session
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["uploads"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/api/sessions/{session_id}/uploads")
async def upload_file(
    session_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Read and validate
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    # Save to disk
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix or ".bin"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        f.write(content)

    logger.info("File uploaded: %s for session %s", filename, session_id)

    return {
        "filename": filename,
        "original_name": file.filename,
        "size": len(content),
        "content_type": file.content_type,
        "url": f"/uploads/{filename}",
    }
