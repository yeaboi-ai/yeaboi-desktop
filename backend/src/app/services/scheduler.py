"""APScheduler integration for recurring report subscriptions.

APScheduler is a soft dependency — when it isn't installed, all the
subscription endpoints still work (CRUD, immediate /run) but automated
firing is a no-op. The UI's `/api/reports/capabilities` already exposes
this so admins know whether the scheduler is live."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session_factory
from ..models.report_subscription import ReportSubscription
from .schedule_math import compute_next_run
from .subscription_runner import run_subscription

logger = logging.getLogger(__name__)


def _try_import_scheduler():
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-not-found]
        from apscheduler.triggers.date import DateTrigger  # type: ignore[import-not-found]

        return AsyncIOScheduler, DateTrigger
    except ImportError:
        return None, None


_AsyncIOScheduler, _DateTrigger = _try_import_scheduler()


def is_available() -> bool:
    return _AsyncIOScheduler is not None


_scheduler = None  # singleton instance once started


async def _job(subscription_id: str) -> None:
    """APScheduler-friendly job wrapper — opens a fresh DB session, runs the
    subscription, and re-schedules itself based on the new next_run_at.

    We use one-shot DateTriggers rather than CronTriggers because the
    schedule_math helper already computes the absolute next firing time,
    which means timezone changes / DST / month-end clamping are all handled
    in our code rather than scattered through APScheduler trigger classes."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            await run_subscription(db, subscription_id)
        except Exception:
            logger.exception("subscription %s job failed", subscription_id)
        # Re-arm regardless of success — failed runs shouldn't stop the loop.
        await schedule_subscription(db, subscription_id)


async def start_scheduler() -> None:
    """Boot the scheduler (no-op if APScheduler isn't installed). Call from
    the FastAPI lifespan startup. Loads every active subscription and arms
    a one-shot job at each one's `next_run_at`."""
    global _scheduler
    if _AsyncIOScheduler is None:
        logger.info("APScheduler not installed — subscriptions will not fire automatically")
        return
    if _scheduler is not None:
        return
    _scheduler = _AsyncIOScheduler(timezone="UTC")
    _scheduler.start()

    factory = get_session_factory()
    async with factory() as db:
        subs = (
            (
                await db.execute(
                    select(ReportSubscription).where(
                        ReportSubscription.is_active.is_(True),
                        ReportSubscription.deleted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            await schedule_subscription(db, sub.id)
    logger.info("scheduler armed: %d active subscriptions", len(subs))


async def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


async def schedule_subscription(db: AsyncSession, subscription_id: str) -> datetime | None:
    """Compute and store next_run_at; if APScheduler is live, register a
    one-shot job at that time. Returns the next_run_at (UTC) or None."""
    sub = (
        await db.execute(select(ReportSubscription).where(ReportSubscription.id == subscription_id))
    ).scalar_one_or_none()
    if sub is None or not sub.is_active or sub.deleted_at is not None:
        await unschedule_subscription(subscription_id)
        return None

    next_run = compute_next_run(
        frequency=sub.frequency,
        schedule_config=sub.schedule_config,
        after=datetime.now(UTC),
    )
    sub.next_run_at = next_run
    await db.commit()

    if _scheduler is not None and next_run is not None and _DateTrigger is not None:
        # Replace any existing job for this subscription.
        try:
            _scheduler.remove_job(subscription_id)
        except Exception:
            pass
        _scheduler.add_job(
            _job,
            trigger=_DateTrigger(run_date=next_run),
            args=[subscription_id],
            id=subscription_id,
            replace_existing=True,
        )
    return next_run


async def unschedule_subscription(subscription_id: str) -> None:
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(subscription_id)
    except Exception:
        pass
