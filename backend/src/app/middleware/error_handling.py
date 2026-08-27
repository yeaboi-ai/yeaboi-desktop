"""Request ID and global exception handling middleware."""

import logging
import uuid

import sentry_sdk
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from ..logging_config import org_id_var, request_id_var, user_id_var

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns a unique request ID to every HTTP request.

    - Reuses incoming X-Request-Id header if present (for tracing across services).
    - Sets the request_id contextvar so all downstream log records include it.
    - Adds X-Request-Id to the response headers.
    - Skips WebSocket connections (they don't use HTTP response headers).
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.scope.get("type") == "websocket":
            return await call_next(request)

        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request_id_var.set(rid)

        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    """Catches unhandled exceptions and returns a structured JSON 500 response.

    - Logs the full traceback so errors are always visible.
    - Does NOT interfere with HTTPException (FastAPI handles those).
    - Skips WebSocket connections.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.scope.get("type") == "websocket":
            return await call_next(request)

        try:
            return await call_next(request)
        except HTTPException:
            raise
        except Exception:
            # Enrich Sentry scope with request context
            uid = user_id_var.get("-")
            sentry_sdk.set_tag("request_id", request_id_var.get("-"))
            sentry_sdk.set_tag("org_id", org_id_var.get("-"))
            if uid != "-":
                sentry_sdk.set_user({"email": uid})
                sentry_sdk.set_tag("user_id", uid)

            logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "An unexpected error occurred.",
                        "request_id": request_id_var.get("-"),
                    }
                },
            )
