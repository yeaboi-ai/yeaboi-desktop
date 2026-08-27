"""Daily sweeper that expires recordings past their `expires_at`.

Runs as a background asyncio task spawned at app startup. Idempotent — picks
up rows still in any non-`expired` status whose expiry is in the past, asks
LiveKit Cloud to drop the underlying asset, and flips the row to `expired`.

Cadence: 1 hour. Cheap enough to run hourly so per-recording expiries land
within an hour of their target. Skip entirely when `recording_enabled=False`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from ..config import get_settings
from ..db import get_session_factory
from ..models.recording import Recording
from .recording import delete_recording_asset

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 3600


async def sweep_once() -> int:
    """Run a single sweep pass. Returns number of rows expired."""
    factory = get_session_factory()
    async with factory() as db:
        return await sweep_with_session(db)


async def sweep_with_session(db) -> int:
    """Sweep using a caller-provided session. Useful for tests."""
    now = datetime.now(UTC)
    rows = (await db.execute(select(Recording).where(Recording.status != "expired"))).scalars().all()

    expired = 0
    for r in rows:
        # Tolerate sqlite tz-naive on the in-memory test DB.
        exp = r.expires_at
        if exp is None:
            continue
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if exp > now:
            continue
        try:
            await delete_recording_asset(egress_id=r.egress_id)
        except Exception:
            logger.warning("Sweeper: failed to delete egress asset %s", r.egress_id, exc_info=True)
        r.status = "expired"
        r.file_url = None  # The asset is gone; null the URL so playback fails fast.
        expired += 1
    if expired:
        await db.commit()
        logger.info("Recording sweeper expired %d row(s)", expired)
    return expired


async def run_sweeper() -> None:
    """Background loop. Cancelled when the app shuts down."""
    if not get_settings().recording_enabled:
        logger.debug("Recording disabled; sweeper not started")
        return
    logger.info("Recording sweeper started (interval=%ds)", SWEEP_INTERVAL_SECONDS)
    while True:
        try:
            await sweep_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Recording sweeper iteration failed; will retry next interval")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
