"""Background probes that populate `status_probes` rows.

Two loops at present (Phase B):
  - `run_internal_probe_loop()`   — every 60s, hits internal health
                                     endpoints and reads readiness checks.
  - `run_provider_snapshot_loop()` — every 60s, derives AI-provider probe
                                     rows from `services.provider_health`
                                     without making any outbound API calls.

The third-party feed loop lives in `status_third_party.py` (Phase C) so the
external-network code path can be skipped in tests/CI without skipping
internal probing.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select, text

from ..config import get_settings
from ..db import get_session_factory
from ..models.status import (
    STATUS_DEGRADED,
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusProbe,
)
from . import provider_health
from .status_incidents import evaluate_auto_incident

logger = logging.getLogger(__name__)


INTERNAL_PROBE_INTERVAL = 60
SNAPSHOT_PROBE_INTERVAL = 60


def _testing_mode() -> bool:
    """Background loops must not run during pytest — the test event loop
    closes between cases and would leak warnings/connections otherwise."""
    return bool(os.environ.get("PYTEST_CURRENT_TEST"))


async def _write_probe(
    db, component_id: str, status_int: int, *, latency_ms: int | None = None, error: str | None = None
) -> None:
    db.add(
        StatusProbe(
            component_id=component_id,
            ts=datetime.now(UTC),
            status=status_int,
            latency_ms=latency_ms,
            error=error,
        )
    )


async def _load_components_for_kind(db, kind_prefix: str) -> list[StatusComponent]:
    rows = await db.execute(
        select(StatusComponent).where(
            StatusComponent.active.is_(True),
            StatusComponent.internal_probe_key.like(f"{kind_prefix}%"),
        )
    )
    return list(rows.scalars().all())


# ---- Internal probes ------------------------------------------------------


async def _probe_database(db) -> tuple[int, int | None, str | None]:
    try:
        start = time.perf_counter()
        await db.execute(text("SELECT 1"))
        latency = int((time.perf_counter() - start) * 1000)
        return STATUS_OPERATIONAL, latency, None
    except Exception:
        logger.warning("status-probe: database probe failed", exc_info=True)
        return STATUS_MAJOR_OUTAGE, None, "db_error"


async def _probe_redis() -> tuple[int, int | None, str | None]:
    settings = get_settings()
    try:
        start = time.perf_counter()
        client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        try:
            await client.ping()
        finally:
            await client.aclose()
        latency = int((time.perf_counter() - start) * 1000)
        return STATUS_OPERATIONAL, latency, None
    except Exception:
        logger.warning("status-probe: redis probe failed", exc_info=True)
        return STATUS_MAJOR_OUTAGE, None, "redis_error"


async def _probe_http(path: str, base_url: str) -> tuple[int, int | None, str | None]:
    url = f"{base_url.rstrip('/')}{path}"
    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(url)
        latency = int((time.perf_counter() - start) * 1000)
        if resp.status_code >= 500:
            return STATUS_MAJOR_OUTAGE, latency, "http_5xx"
        if resp.status_code >= 400:
            return STATUS_DEGRADED, latency, "http_4xx"
        return STATUS_OPERATIONAL, latency, None
    except Exception:
        logger.warning("status-probe: http probe failed: %s", url, exc_info=True)
        return STATUS_MAJOR_OUTAGE, None, "timeout"


async def _run_internal_probes_once(base_url: str) -> None:
    factory = get_session_factory()
    async with factory() as db:
        components = await _load_components_for_kind(db, "")
        for component in components:
            key = component.internal_probe_key or ""
            if key.startswith("http:"):
                _, _, path = key.partition(":")
                status_int, latency, error = await _probe_http(path, base_url)
            elif key == "ready:database":
                status_int, latency, error = await _probe_database(db)
            elif key == "ready:redis":
                status_int, latency, error = await _probe_redis()
            else:
                # Probe loop only handles internal kinds here; provider/snapshot
                # kinds are covered by the other loop, and feature-level probes
                # are derived from their dependency components.
                continue
            await _write_probe(db, component.id, status_int, latency_ms=latency, error=error)
            await evaluate_auto_incident(db, component)
        await db.commit()


async def run_internal_probe_loop() -> None:
    if _testing_mode():
        return
    settings = get_settings()
    base_url = getattr(settings, "internal_base_url", None) or f"http://localhost:{getattr(settings, 'port', 8000)}"
    logger.info("status internal-probe loop starting (every %ds)", INTERNAL_PROBE_INTERVAL)
    try:
        while True:
            try:
                await _run_internal_probes_once(base_url)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("status internal-probe loop iteration failed")
            await asyncio.sleep(INTERNAL_PROBE_INTERVAL)
    except asyncio.CancelledError:
        logger.info("status internal-probe loop cancelled")
        raise


# ---- AI-provider snapshot derivation --------------------------------------


async def _run_snapshot_probes_once() -> None:
    """Mirror the live Redis provider-health snapshot into probe rows."""
    factory = get_session_factory()
    async with factory() as db:
        components = await _load_components_for_kind(db, "provider:")
        for component in components:
            provider_name = (component.internal_probe_key or "").split(":", 1)[1]
            snapshot = await provider_health.get("platform", provider_name)
            if snapshot is None or snapshot.get("status") == "ok":
                status_int, error = STATUS_OPERATIONAL, None
            else:
                status_int, error = STATUS_MAJOR_OUTAGE, "provider_unhealthy"
            await _write_probe(db, component.id, status_int, latency_ms=None, error=error)
            await evaluate_auto_incident(db, component)
        await db.commit()


async def run_provider_snapshot_loop() -> None:
    if _testing_mode():
        return
    logger.info("status snapshot loop starting (every %ds)", SNAPSHOT_PROBE_INTERVAL)
    try:
        while True:
            try:
                await _run_snapshot_probes_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("status snapshot loop iteration failed")
            await asyncio.sleep(SNAPSHOT_PROBE_INTERVAL)
    except asyncio.CancelledError:
        logger.info("status snapshot loop cancelled")
        raise
