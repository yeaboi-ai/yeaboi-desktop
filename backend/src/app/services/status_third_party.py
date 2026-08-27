"""Third-party status feed ingestion.

Most vendors we depend on (GitHub, Slack, Atlassian, Notion, Linear, Figma,
Anthropic, OpenAI) publish a statuspage.io-compatible JSON summary at
``/api/v2/summary.json``. The shape we care about:

    { "status": { "indicator": "none" | "minor" | "major" | "critical" }, ... }

Slack uses a slightly different schema served from
``status.slack.com/api/v2.0.0/current`` — we normalise both here.

Loop runs every 5 minutes. External-network code lives in its own module so
it can be disabled independently (e.g. in CI) without compromising the
internal probe loop.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select

from ..db import get_session_factory
from ..models.status import (
    STATUS_DEGRADED,
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    STATUS_PARTIAL_OUTAGE,
    StatusComponent,
    StatusProbe,
)
from . import provider_health
from .status_incidents import evaluate_auto_incident

logger = logging.getLogger(__name__)


THIRD_PARTY_INTERVAL = 300

# How long to cache the per-vendor unresolved-incident list. Public status page
# cache header is 30s; 60s here means at worst we're one snapshot stale and we
# never hammer the vendor's statuspage from a high-traffic outage.
_UPSTREAM_CACHE_TTL = 60
_UPSTREAM_CACHE_KEY_PREFIX = "status_upstream_incidents:"


def _statuspage_indicator_to_int(indicator: str | None) -> int:
    """Map statuspage.io indicator → our probe-status enum.

    Anything we don't recognise → operational rather than down, since these
    are *informational* feeds; we don't want a schema change at the vendor
    end to spuriously flip our status to red.
    """
    return {
        "none": STATUS_OPERATIONAL,
        "minor": STATUS_DEGRADED,
        "major": STATUS_PARTIAL_OUTAGE,
        "critical": STATUS_MAJOR_OUTAGE,
    }.get((indicator or "").lower(), STATUS_OPERATIONAL)


def _parse_feed(payload: Any) -> int:
    """Best-effort: pull the worst indicator from a statuspage.io-style payload."""
    if not isinstance(payload, dict):
        return STATUS_OPERATIONAL
    status_block = payload.get("status")
    if isinstance(status_block, dict):
        return _statuspage_indicator_to_int(status_block.get("indicator"))
    # Slack v2.0.0 response shape: {"status": "active|inactive", "service_id": ...}.
    if isinstance(status_block, str):
        return STATUS_OPERATIONAL if status_block.lower() == "active" else STATUS_DEGRADED
    return STATUS_OPERATIONAL


async def _fetch_feed(url: str) -> tuple[int, str | None]:
    """GET a feed URL → (status_int, error_bucket). Network errors → degraded
    rather than down — a transient network blip in our process shouldn't
    show as a third-party outage."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(url)
        if resp.status_code != 200:
            return STATUS_DEGRADED, f"http_{resp.status_code}"
        try:
            payload = resp.json()
        except Exception:
            return STATUS_DEGRADED, "bad_json"
        return _parse_feed(payload), None
    except Exception:
        logger.debug("status: third-party feed unreachable: %s", url, exc_info=True)
        return STATUS_DEGRADED, "timeout"


async def _run_third_party_feed_once() -> None:
    factory = get_session_factory()
    async with factory() as db:
        components = (
            (
                await db.execute(
                    select(StatusComponent).where(
                        StatusComponent.active.is_(True),
                        StatusComponent.third_party_status_url.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        for component in components:
            url = component.third_party_status_url
            if not url:
                continue
            status_int, error = await _fetch_feed(url)
            db.add(
                StatusProbe(
                    component_id=component.id,
                    ts=datetime.now(UTC),
                    status=status_int,
                    latency_ms=None,
                    error=error,
                )
            )
            await evaluate_auto_incident(db, component)
        await db.commit()


async def _fetch_upstream_incidents_live(base_url: str) -> list[dict[str, Any]]:
    """GET {base_url}/api/v2/incidents/unresolved.json and normalise the rows.

    Returns up to 5 unresolved incidents, each shaped:
        {name, status, impact, shortlink, started_at}
    On any error returns []. Never raises — we'd rather show no incidents than
    break the public status page on a vendor schema change.
    """
    url = base_url.rstrip("/") + "/api/v2/incidents/unresolved.json"
    try:
        async with httpx.AsyncClient(timeout=4.0) as http:
            resp = await http.get(url)
        if resp.status_code != 200:
            return []
        payload = resp.json()
    except Exception:
        logger.debug("status: upstream incidents fetch failed for %s", base_url, exc_info=True)
        return []

    incidents = payload.get("incidents") if isinstance(payload, dict) else None
    if not isinstance(incidents, list):
        return []

    out: list[dict[str, Any]] = []
    for inc in incidents[:5]:
        if not isinstance(inc, dict):
            continue
        started_raw = inc.get("started_at") or inc.get("created_at")
        if not isinstance(started_raw, str):
            continue
        try:
            started_at = datetime.fromisoformat(started_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        out.append(
            {
                "name": str(inc.get("name") or "Incident"),
                "status": str(inc.get("status") or "investigating"),
                "impact": str(inc.get("impact") or "minor"),
                "shortlink": str(inc.get("shortlink") or base_url),
                "started_at": started_at.isoformat(),
            }
        )
    return out


async def fetch_upstream_incidents(component_key: str, base_url: str) -> list[dict[str, Any]]:
    """Cached read of a vendor's unresolved incidents. Returns [] on any failure."""
    cache_key = _UPSTREAM_CACHE_KEY_PREFIX + component_key
    redis_client = await provider_health._get_redis()
    if redis_client is not None:
        try:
            raw = await redis_client.get(cache_key)
            if raw is not None:
                cached = json.loads(raw)
                if isinstance(cached, list):
                    return cached
        except Exception:
            logger.debug("status: upstream cache read failed", exc_info=True)

    incidents = await _fetch_upstream_incidents_live(base_url)

    if redis_client is not None:
        try:
            await redis_client.setex(cache_key, _UPSTREAM_CACHE_TTL, json.dumps(incidents))
        except Exception:
            logger.debug("status: upstream cache write failed", exc_info=True)
    return incidents


async def run_third_party_feed_loop() -> None:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    logger.info("status third-party feed loop starting (every %ds)", THIRD_PARTY_INTERVAL)
    try:
        while True:
            try:
                await _run_third_party_feed_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("status third-party feed iteration failed")
            await asyncio.sleep(THIRD_PARTY_INTERVAL)
    except asyncio.CancelledError:
        logger.info("status third-party feed loop cancelled")
        raise
