"""Security-related response headers and request-size limits.

Two middlewares:

* :class:`SecurityHeadersMiddleware` — adds HSTS (prod only), X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, Permissions-Policy, and a CSP delivered in
  ``Content-Security-Policy-Report-Only`` mode by default so we can collect
  violations from real browsers before switching to enforce.
* :class:`BodySizeLimitMiddleware` — rejects requests whose ``Content-Length``
  exceeds the configured cap (default 10 MB). Upload routes opt out via path
  prefix because they have their own 50 MB cap.

CSP notes:
    - ``frame-ancestors 'none'`` is the modern replacement for X-Frame-Options,
      but we keep both headers for older browsers.
    - LiveKit needs WebRTC, so ``media-src`` and ``connect-src`` are permissive
      enough to include the LiveKit websocket and the configured app origins.
    - Excalidraw uses inline styles; ``style-src 'unsafe-inline'`` stays for now.
      Migrate to nonces in a follow-up once we audit which styles are inline.

To flip CSP from report-only to enforce, change ``CSP_HEADER`` below or wire it
to a settings flag (e.g. ``CSP_ENFORCE=true``). Run report-only for a week first.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# 10 MB is plenty for JSON request bodies; uploads have their own 50 MB cap.
DEFAULT_BODY_LIMIT_BYTES = 10 * 1024 * 1024

# Paths that bypass the body-size limit because they have their own check.
_BODY_LIMIT_EXEMPT_PREFIXES = ("/api/uploads", "/api/attachments", "/api/card-attachments")

# CSP_HEADER currently lives in report-only mode. Flip to "Content-Security-Policy"
# (enforce) only after a week of report-only with no real violations.
CSP_REPORT_ONLY = True

# Comma-separated for readability; joined with semicolons at use.
_CSP_DIRECTIVES = [
    "default-src 'self'",
    # Next.js needs eval/inline for hydration in dev; tighten with a nonce later.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    # Connect: LiveKit websocket, our backend, OAuth providers
    "connect-src 'self' https: wss:",
    "media-src 'self' blob: https:",
    "frame-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    "object-src 'none'",
    "upgrade-insecure-requests",
]

CSP_HEADER = "; ".join(_CSP_DIRECTIVES)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Sets standard security response headers on every HTTP response."""

    def __init__(self, app, in_production: bool = False) -> None:
        super().__init__(app)
        self.in_production = in_production

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)

        # HSTS — only useful over HTTPS, and in prod we know we terminate TLS at
        # the edge. Don't add it in dev or browsers will refuse the next
        # http://localhost visit.
        if self.in_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # LiveKit needs camera/microphone; everything else is denied by default.
        response.headers["Permissions-Policy"] = (
            "camera=(self), microphone=(self), geolocation=(), "
            "payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
        )

        csp_header_name = (
            "Content-Security-Policy-Report-Only"
            if CSP_REPORT_ONLY
            else "Content-Security-Policy"
        )
        response.headers[csp_header_name] = CSP_HEADER

        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose declared Content-Length exceeds the cap."""

    def __init__(self, app, max_bytes: int = DEFAULT_BODY_LIMIT_BYTES) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path
        if path.startswith(_BODY_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Invalid Content-Length header"},
                )
            if size > self.max_bytes:
                logger.warning(
                    "Rejected oversized request: path=%s content_length=%d cap=%d",
                    path,
                    size,
                    self.max_bytes,
                )
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "Request body too large",
                        "max_bytes": self.max_bytes,
                    },
                )
        return await call_next(request)
