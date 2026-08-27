"""Daily sweeper for status probe rows + daily-uptime rollup."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select

from ..db import get_session_factory
from ..models.status import (
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusProbe,
    StatusProbeDaily,
)

logger = logging.getLogger(__name__)


SWEEP_INTERVAL_SECONDS = 24 * 3600
RETENTION_DAYS = 90


async def _sweep_old_probes(db) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)
    result = await db.execute(delete(StatusProbe).where(StatusProbe.ts < cutoff))
    return getattr(result, "rowcount", 0) or 0


async def _rollup_yesterday(db, target_day: date | None = None) -> int:
    """Aggregate probe rows from `target_day` into the daily rollup table.

    Idempotent — on conflict we update in-place rather than insert a duplicate.
    Returns the number of components rolled up.
    """
    day = target_day or (datetime.now(UTC).date() - timedelta(days=1))
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    day_end = day_start + timedelta(days=1)

    components = (await db.execute(select(StatusComponent))).scalars().all()

    rolled = 0
    for component in components:
        rows = (
            await db.execute(
                select(StatusProbe.status).where(
                    StatusProbe.component_id == component.id,
                    StatusProbe.ts >= day_start,
                    StatusProbe.ts < day_end,
                )
            )
        ).all()
        statuses = [r[0] for r in rows]
        if not statuses:
            continue
        worst = max(statuses)
        operational = sum(1 for s in statuses if s == STATUS_OPERATIONAL)
        uptime_pct = round(100.0 * operational / len(statuses), 2)

        existing = (
            await db.execute(
                select(StatusProbeDaily).where(
                    StatusProbeDaily.component_id == component.id, StatusProbeDaily.day == day
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                StatusProbeDaily(
                    component_id=component.id,
                    day=day,
                    worst_status=worst,
                    uptime_pct=uptime_pct,
                    sample_count=len(statuses),
                )
            )
        else:
            existing.worst_status = worst
            existing.uptime_pct = uptime_pct
            existing.sample_count = len(statuses)
        rolled += 1
    await db.commit()
    return rolled


async def sweep_once() -> tuple[int, int]:
    factory = get_session_factory()
    async with factory() as db:
        deleted = await _sweep_old_probes(db)
        await db.commit()
        rolled = await _rollup_yesterday(db)
    logger.info("status-sweeper: deleted=%d, rolled_up_components=%d", deleted, rolled)
    return deleted, rolled


async def run_status_sweeper() -> None:
    """Long-running task: daily probe-table sweep + yesterday rollup."""
    import os

    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    logger.info("status-sweeper starting (every %ds)", SWEEP_INTERVAL_SECONDS)
    try:
        while True:
            try:
                await sweep_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("status-sweeper iteration failed")
            await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("status-sweeper cancelled")
        raise
