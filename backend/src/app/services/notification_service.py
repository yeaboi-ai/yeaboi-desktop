import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.notification import Notification

logger = logging.getLogger(__name__)


async def notify(
    user_id: str,
    title: str,
    body: str | None = None,
    type: str = "info",
    link: str | None = None,
    session_id: str | None = None,
    db: AsyncSession | None = None,
) -> None:
    """Create a notification for a user."""
    if not db:
        from ..db import get_session_factory

        session_factory = get_session_factory()
        async with session_factory() as db:
            n = Notification(
                user_id=user_id,
                title=title,
                body=body,
                type=type,
                link=link,
                session_id=session_id,
            )
            db.add(n)
            await db.commit()
    else:
        n = Notification(
            user_id=user_id,
            title=title,
            body=body,
            type=type,
            link=link,
            session_id=session_id,
        )
        db.add(n)
