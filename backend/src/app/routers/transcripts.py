import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.session import Session, TranscriptEntry
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transcripts"])


@router.get("/api/sessions/{session_id}/transcript")
async def get_transcript(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(select(Session).where(Session.id == session_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(TranscriptEntry)
        .where(TranscriptEntry.session_id == session_id)
        .order_by(TranscriptEntry.created_at.asc())
    )
    entries = result.scalars().all()
    return [
        {
            "id": e.id,
            "speaker_id": e.speaker_id,
            "speaker_name": e.speaker_name,
            "text": e.text,
            "is_final": e.is_final,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]
