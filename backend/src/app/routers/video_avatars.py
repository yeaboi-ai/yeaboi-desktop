import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user, require_admin
from ..models.organization import Organization
from ..models.user import User
from ..models.video_avatar import VideoAvatar
from ..schemas.video_avatar import (
    VideoAvatarCreate,
    VideoAvatarResponse,
    VideoAvatarUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["video-avatars"])


@router.get("/api/video-avatars", response_model=list[VideoAvatarResponse])
async def list_video_avatars(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[VideoAvatar]:
    """List video avatars visible to the caller: system avatars + own org's avatars."""
    result = await db.execute(
        select(VideoAvatar)
        .where(
            VideoAvatar.deleted_at.is_(None),
            or_(VideoAvatar.is_system.is_(True), VideoAvatar.org_id == org.id),
        )
        .order_by(VideoAvatar.sort_order, VideoAvatar.name)
    )
    return list(result.scalars().all())


@router.post("/api/video-avatars", status_code=201, response_model=VideoAvatarResponse)
async def create_video_avatar(
    body: VideoAvatarCreate,
    user: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> VideoAvatar:
    """Admin: create an org-scoped video avatar."""
    avatar = VideoAvatar(
        org_id=org.id,
        name=body.name,
        description=body.description,
        provider=body.provider,
        replica_id=body.replica_id,
        preview_url=body.preview_url,
        gender=body.gender,
        voice_id=body.voice_id,
        realtime_voice=body.realtime_voice,
        voice_sample_url=body.voice_sample_url,
        tavus_persona_id=body.tavus_persona_id,
        sort_order=body.sort_order,
        is_system=False,
    )
    db.add(avatar)
    await db.commit()
    await db.refresh(avatar)
    logger.info("Video avatar created: %s (org=%s)", avatar.id, org.id)
    return avatar


@router.patch("/api/video-avatars/{avatar_id}", response_model=VideoAvatarResponse)
async def update_video_avatar(
    avatar_id: str,
    body: VideoAvatarUpdate,
    user: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> VideoAvatar:
    """Admin: update an org-scoped video avatar. System avatars are read-only."""
    result = await db.execute(
        select(VideoAvatar).where(
            VideoAvatar.id == avatar_id,
            VideoAvatar.org_id == org.id,
            VideoAvatar.deleted_at.is_(None),
        )
    )
    avatar = result.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Video avatar not found")
    if avatar.is_system:
        raise HTTPException(status_code=400, detail="Cannot modify system video avatars")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(avatar, field, value)

    await db.commit()
    await db.refresh(avatar)
    return avatar


@router.delete("/api/video-avatars/{avatar_id}", status_code=204)
async def delete_video_avatar(
    avatar_id: str,
    user: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Admin: soft-delete an org-scoped video avatar."""
    result = await db.execute(
        select(VideoAvatar).where(
            VideoAvatar.id == avatar_id,
            VideoAvatar.org_id == org.id,
            VideoAvatar.deleted_at.is_(None),
        )
    )
    avatar = result.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Video avatar not found")
    if avatar.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system video avatars")

    avatar.deleted_at = datetime.now(UTC)
    await db.commit()
