"""Persona-aware lip-synced character preview videos.

`POST /api/character-previews/video` — lazy Tavus-rendered MP4 with perfect
lip sync of a persona-specific intro line. First call kicks off ~1-2 min
generation; subsequent calls return the cached URL. Tavus uses the persona
configured on each character (tavus_persona_id) so the voice matches what
live calls produce.

The earlier ElevenLabs audio-only intro endpoint was removed when Tavus
videos became fast/cheap enough to be the only studio preview path.
"""

from __future__ import annotations

import hashlib
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.character_video_preview import CharacterVideoPreview
from ..models.organization import Organization
from ..models.user import User
from ..models.video_avatar import VideoAvatar

logger = logging.getLogger(__name__)

router = APIRouter(tags=["character-previews"])

TAVUS_API_BASE = "https://tavusapi.com/v2"


class CharacterPreviewRequest(BaseModel):
    character_id: str
    persona_name: str


def _parse_progress(raw: str | None) -> int | None:
    """Tavus reports `generation_progress` as 'X/100'. Return X as int, or None."""
    if not raw:
        return None
    try:
        return int(str(raw).split("/")[0].strip())
    except (ValueError, IndexError):
        return None


def _intro_text(character_name: str, persona_name: str) -> str:
    """Compose a short, persona-aware intro line for TTS."""
    persona = (persona_name or "").strip() or "facilitator"
    # Light per-role flavour so the listener hears the persona shift.
    flavour = {
        "senior engineer": "Let's dig into the trade-offs.",
        "product manager": "Let's keep this focused on what users need.",
        "system architect": "Let's design something that scales.",
        "patient mentor": "We'll go through this step by step.",
        "devil's advocate": "I'll stress-test every assumption.",
    }.get(persona.lower(), "")
    suffix = (" " + flavour).rstrip()
    return f"Hi, I'm {character_name}. As your {persona}, I'm here to help.{suffix}"


class CharacterVideoPreviewResponse(BaseModel):
    status: str  # "generating" | "ready" | "error"
    video_url: str | None = None
    cache_key: str
    error: str | None = None
    # 0-100, only meaningful while status="generating". Pulled from Tavus's
    # generation_progress on each poll so the studio can show a percentage.
    progress: int | None = None


@router.post("/api/character-previews/video", response_model=CharacterVideoPreviewResponse)
async def generate_character_video_preview(
    body: CharacterPreviewRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> CharacterVideoPreviewResponse:
    """Lazy lip-synced video for a (character, persona) pair.

    First call kicks off Tavus generation (~1-2 min). Subsequent calls return
    cached URL or refresh status from Tavus until ready.
    """
    tavus_key = os.getenv("TAVUS_API_KEY")
    if not tavus_key:
        raise HTTPException(status_code=503, detail="Tavus not configured")

    # Resolve character (system or own org)
    char_result = await db.execute(
        select(VideoAvatar).where(
            VideoAvatar.id == body.character_id,
            VideoAvatar.deleted_at.is_(None),
            or_(VideoAvatar.is_system.is_(True), VideoAvatar.org_id == org.id),
        )
    )
    avatar = char_result.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Character not found")
    if avatar.provider != "tavus" or not avatar.replica_id:
        raise HTTPException(status_code=400, detail="Character has no Tavus replica")

    persona_name = (body.persona_name or "").strip() or "facilitator"
    cache_key = hashlib.sha1(f"{avatar.id}|{persona_name.lower()}".encode()).hexdigest()

    # Look for an existing row
    existing_result = await db.execute(
        select(CharacterVideoPreview).where(CharacterVideoPreview.cache_key == cache_key)
    )
    row = existing_result.scalar_one_or_none()

    # Already-resolved cases
    if row and row.status == "ready" and row.video_url:
        return CharacterVideoPreviewResponse(status="ready", video_url=row.video_url, cache_key=cache_key)
    if row and row.status == "error":
        return CharacterVideoPreviewResponse(
            status="error", cache_key=cache_key, error=row.error_message or "render failed"
        )

    # Refresh status from Tavus if we have an in-flight render
    if row and row.tavus_video_id:
        progress: int | None = None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                poll = await client.get(
                    f"{TAVUS_API_BASE}/videos/{row.tavus_video_id}",
                    headers={"x-api-key": tavus_key},
                )
            if poll.status_code == 200:
                data = poll.json()
                tavus_status = data.get("status")
                progress = _parse_progress(data.get("generation_progress"))
                if tavus_status == "ready":
                    row.status = "ready"
                    row.video_url = data.get("download_url") or data.get("hosted_url")
                elif tavus_status == "error":
                    row.status = "error"
                    row.error_message = data.get("status_details") or "Tavus render error"
                # else still 'queued' / 'generating' — leave status alone
                await db.commit()
                await db.refresh(row)
        except Exception as e:
            logger.warning("Tavus poll failed for %s: %s", row.tavus_video_id, e)

        return CharacterVideoPreviewResponse(
            status=row.status,
            video_url=row.video_url,
            cache_key=cache_key,
            error=row.error_message,
            progress=progress,
        )

    # No row → kick off a fresh Tavus generation.
    # Note: Tavus's POST /v2/videos does NOT accept persona_id (only
    # /v2/conversations does). Voice on /v2/videos comes from the replica's
    # default unless we provide audio_url. So studio renders use Tavus's
    # default voice for the replica — they may not exactly match the live
    # call audio (where the persona's voice config does apply).
    text = _intro_text(avatar.name, persona_name)
    payload: dict = {
        "replica_id": avatar.replica_id,
        "script": text,
        "video_name": f"intro_{avatar.name.lower()}_{persona_name.lower().replace(' ', '_')}",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            create = await client.post(
                f"{TAVUS_API_BASE}/videos",
                headers={"x-api-key": tavus_key, "Content-Type": "application/json"},
                json=payload,
            )
    except Exception as e:
        logger.warning("Tavus create failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to start video generation") from e

    if create.status_code not in (200, 201):
        logger.warning("Tavus create non-2xx: status=%s body=%s", create.status_code, create.text[:200])
        raise HTTPException(status_code=502, detail="Tavus rejected the render request")

    payload = create.json()
    video_id = payload.get("video_id")
    if not video_id:
        raise HTTPException(status_code=502, detail="Tavus did not return a video_id")

    row = CharacterVideoPreview(
        cache_key=cache_key,
        character_id=avatar.id,
        persona_name=persona_name,
        status="generating",
        tavus_video_id=video_id,
    )
    db.add(row)
    await db.commit()
    logger.info(
        "Started Tavus render: char=%s persona=%r video_id=%s",
        avatar.id,
        persona_name,
        video_id,
    )
    return CharacterVideoPreviewResponse(status="generating", cache_key=cache_key)
