import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.feedback import Feedback
from ..models.organization import Organization
from ..models.user import User
from ..schemas.feedback import FeedbackCreate, FeedbackResponse, FeedbackSummary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    body: FeedbackCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Submit or update feedback. Upserts on (user_id, target_type, target_id)."""
    # Check for existing feedback from this user on this target
    existing = None
    if body.target_id:
        result = await db.execute(
            select(Feedback).where(
                Feedback.user_id == user.id,
                Feedback.target_type == body.target_type,
                Feedback.target_id == body.target_id,
            )
        )
        existing = result.scalar_one_or_none()

    if existing:
        existing.rating = body.rating
        existing.comment = body.comment
        existing.context = body.context
        existing.agent_type = body.agent_type
        existing.session_id = body.session_id
        await db.commit()
        await db.refresh(existing)
        logger.info("Feedback updated: %s by user %s", existing.id, user.id)
        return existing

    feedback = Feedback(
        org_id=org.id,
        user_id=user.id,
        session_id=body.session_id,
        target_type=body.target_type,
        target_id=body.target_id,
        agent_type=body.agent_type,
        rating=body.rating,
        comment=body.comment,
        context=body.context,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    logger.info("Feedback submitted: %s by user %s on %s/%s", feedback.id, user.id, body.target_type, body.target_id)
    return feedback


@router.get("", response_model=list[FeedbackResponse])
async def list_feedback(
    session_id: str | None = Query(None),
    target_type: str | None = Query(None),
    agent_type: str | None = Query(None),
    user_id: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Query feedback with optional filters. Scoped to org."""
    query = select(Feedback).where(Feedback.org_id == org.id)

    if session_id:
        query = query.where(Feedback.session_id == session_id)
    if target_type:
        query = query.where(Feedback.target_type == target_type)
    if agent_type:
        query = query.where(Feedback.agent_type == agent_type)
    if user_id:
        query = query.where(Feedback.user_id == user_id)

    query = query.order_by(Feedback.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/summary", response_model=FeedbackSummary)
async def feedback_summary(
    session_id: str | None = Query(None),
    agent_type: str | None = Query(None),
    target_type: str | None = Query(None),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate feedback stats."""
    filters = [Feedback.org_id == org.id]
    if session_id:
        filters.append(Feedback.session_id == session_id)
    if agent_type:
        filters.append(Feedback.agent_type == agent_type)
    if target_type:
        filters.append(Feedback.target_type == target_type)

    count_q = select(
        func.count().label("total"),
        func.sum(case((Feedback.rating == "thumbs_up", 1), else_=0)).label("thumbs_up"),
        func.sum(case((Feedback.rating == "thumbs_down", 1), else_=0)).label("thumbs_down"),
        func.sum(case((Feedback.comment.isnot(None), 1), else_=0)).label("with_comments"),
    ).where(*filters)

    row = (await db.execute(count_q)).one()

    # Breakdown by agent_type
    breakdown_q = (
        select(
            Feedback.agent_type,
            Feedback.rating,
            func.count().label("cnt"),
        )
        .where(*filters)
        .group_by(Feedback.agent_type, Feedback.rating)
    )

    breakdown_rows = (await db.execute(breakdown_q)).all()
    by_agent: dict[str, dict[str, int]] = {}
    for agent, rating, cnt in breakdown_rows:
        by_agent.setdefault(agent, {"thumbs_up": 0, "thumbs_down": 0})[rating] = cnt

    return FeedbackSummary(
        total=row.total or 0,
        thumbs_up=row.thumbs_up or 0,
        thumbs_down=row.thumbs_down or 0,
        with_comments=row.with_comments or 0,
        by_agent_type=by_agent,
    )


@router.delete("/{feedback_id}", status_code=204)
async def retract_feedback(
    feedback_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retract own feedback."""
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if feedback.user_id != user.id:
        raise HTTPException(status_code=403, detail="Can only retract your own feedback")
    await db.execute(delete(Feedback).where(Feedback.id == feedback_id))
    await db.commit()
    logger.info("Feedback retracted: %s by user %s", feedback_id, user.id)
