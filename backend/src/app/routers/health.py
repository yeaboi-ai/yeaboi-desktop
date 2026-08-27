"""Health check endpoints: liveness and readiness probes."""

import logging
import time
from datetime import UTC, datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, Request
from sqlalchemy import text

from ..config import get_settings
from ..db import _get_engine
from ..middleware.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/api/health/live")
@limiter.limit("120/minute")
async def liveness(request: Request) -> dict:
    """Lightweight liveness probe — confirms the process is alive and responding."""
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


@router.get("/api/health/ready")
@limiter.limit("60/minute")
async def readiness(request: Request) -> dict:
    """Readiness probe — checks critical dependencies before accepting traffic.

    Returns 200 if all critical checks pass, 503 otherwise.
    Component-level status is always returned for debugging.
    """
    checks: dict[str, dict] = {}
    settings = get_settings()

    # --- PostgreSQL ---
    try:
        start = time.monotonic()
        engine = _get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency = round((time.monotonic() - start) * 1000, 1)
        checks["database"] = {"status": "ok", "latency_ms": latency}
    except Exception:
        logger.warning("Readiness: database check failed", exc_info=True)
        checks["database"] = {"status": "unhealthy", "error": "connection failed"}

    # --- Redis ---
    try:
        start = time.monotonic()
        redis_client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        try:
            await redis_client.ping()
            latency = round((time.monotonic() - start) * 1000, 1)
            checks["redis"] = {"status": "ok", "latency_ms": latency}
        finally:
            await redis_client.aclose()
    except Exception:
        logger.warning("Readiness: redis check failed", exc_info=True)
        checks["redis"] = {"status": "unhealthy", "error": "connection failed"}

    # --- Alembic migrations ---
    try:
        engine = _get_engine()
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            row = result.first()
            current_rev = row[0] if row else None
        checks["migrations"] = {"status": "ok", "revision": current_rev}
    except Exception:
        logger.warning("Readiness: migration check failed", exc_info=True)
        checks["migrations"] = {"status": "unknown", "error": "could not read alembic_version"}

    # --- Config sanity ---
    if settings.nextauth_secret == "dev-secret-change-me":
        checks["config"] = {"status": "warn", "detail": "using default nextauth_secret"}
    else:
        checks["config"] = {"status": "ok"}

    # --- Overall status ---
    critical = [checks.get("database", {}), checks.get("migrations", {})]
    if any(c.get("status") == "unhealthy" for c in critical):
        overall = "unhealthy"
        status_code = 503
    elif any(c.get("status") in ("warn", "unknown") for c in checks.values()):
        overall = "degraded"
        status_code = 200
    else:
        overall = "ok"
        status_code = 200

    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=status_code,
        content={"status": overall, "checks": checks},
    )
