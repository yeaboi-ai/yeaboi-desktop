"""Request timing middleware — logs duration and adds X-Response-Time header."""

import logging
import re
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from ..metrics import REQUEST_COUNT, REQUEST_LATENCY

logger = logging.getLogger(__name__)

# Requests slower than this threshold (ms) are logged at WARNING level.
_SLOW_REQUEST_MS = 2000

# Regex to collapse UUID and numeric path segments into placeholders,
# keeping Prometheus label cardinality low.
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_ID_RE = re.compile(r"/[0-9a-f]{8,}(?=/|$)")


def _normalize_path(path: str) -> str:
    path = _UUID_RE.sub("{id}", path)
    path = _ID_RE.sub("/{id}", path)
    return path


class TimingMiddleware(BaseHTTPMiddleware):
    """Measures request duration, logs it, and sets the X-Response-Time header."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.scope.get("type") == "websocket":
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_s = time.perf_counter() - start
        duration_ms = duration_s * 1000

        response.headers["X-Response-Time"] = f"{duration_ms:.1f}ms"

        path = request.url.path
        method = request.method
        status = response.status_code

        # Emit Prometheus metrics with normalized path
        endpoint = _normalize_path(path)
        REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=str(status)).inc()
        REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration_s)

        if duration_ms > _SLOW_REQUEST_MS:
            logger.warning("Slow request: %s %s → %d in %.0fms", method, path, status, duration_ms)
        else:
            logger.info("%s %s → %d in %.1fms", method, path, status, duration_ms)

        return response
