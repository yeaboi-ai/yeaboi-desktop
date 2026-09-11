import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.notification import Notification
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50)
    )
    notifications = result.scalars().all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "type": n.type,
            "read": n.read,
            "link": n.link,
            "session_id": n.session_id,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    await db.commit()
    logger.info("All notifications marked read for user %s", user.id)
    return {"status": "ok"}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id)
        .values(read=True)
    )
    await db.commit()
    logger.info("Notification marked read: %s", notification_id)
    return {"status": "ok"}
