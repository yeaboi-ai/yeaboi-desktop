import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import get_settings
from .logging_config import request_id_var, setup_logging
from .middleware.error_handling import GlobalExceptionMiddleware, RequestIdMiddleware
from .middleware.rate_limit import limiter
from .middleware.timing import TimingMiddleware
from .routers.admin_status import router as admin_status_router
from .routers.admin_usage import router as admin_usage_router
from .routers.ai_config import router as ai_config_router
from .routers.analytics import router as analytics_router
from .routers.app_settings_routes import router as app_settings_router
from .routers.attachments import router as attachments_router
from .routers.blueprint_templates import router as blueprint_templates_router
from .routers.blueprints import router as blueprints_router
from .routers.boards import router as boards_router
from .routers.brand import router as brand_router
from .routers.card_attachments import router as card_attachments_router
from .routers.card_links import router as card_links_router
from .routers.card_views import router as card_views_router
from .routers.character_previews import router as character_previews_router
from .routers.chat import router as chat_router
from .routers.clips import router as clips_router
from .routers.directory import router as directory_router
from .routers.feedback import router as feedback_router
from .routers.generation_options import router as generation_options_router
from .routers.generation_presets import router as generation_presets_router
from .routers.harness import router as harness_router
from .routers.health import router as health_router
from .routers.integration_mappings import router as integration_mappings_router
from .routers.integrations import router as integrations_router
from .routers.internal import router as internal_router
from .routers.invites import router as invites_router
from .routers.livekit_routes import router as livekit_router
from .routers.livekit_webhooks import router as livekit_webhooks_router
from .routers.me import router as me_router
from .routers.niko import router as niko_router
from .routers.notifications import router as notifications_router
from .routers.oauth import router as oauth_router
from .routers.orchestrator import router as orchestrator_router
from .routers.organizations import router as organizations_router
from .routers.public_status import router as public_status_router
from .routers.recordings import router as recordings_router
from .routers.report_subscriptions import router as report_subscriptions_router
from .routers.reports import router as reports_router
from .routers.session_attachments import router as session_attachments_router
from .routers.session_outputs import router as session_outputs_router
from .routers.session_workspace import router as session_workspace_router
from .routers.sessions import router as sessions_router
from .routers.settings_routes import router as settings_router
from .routers.slack_interactive import router as slack_interactive_router
from .routers.sync_actions import router as sync_actions_router
from .routers.sync_webhooks import router as sync_webhooks_router
from .routers.system_health import router as system_health_router
from .routers.team import router as team_router
from .routers.team_last_viewed import router as team_last_viewed_router
from .routers.team_slack_channels import router as team_slack_channels_router
from .routers.themes import router as themes_router
from .routers.ticket_templates import router as ticket_templates_router
from .routers.transcripts import router as transcripts_router
from .routers.uploads import router as uploads_router
from .routers.video_avatars import router as video_avatars_router
from .routers.vocabulary import router as vocabulary_router
from .routers.voice_notes import router as voice_notes_router
from .routers.voice_profile import router as voice_profile_router
from .services.ai_provider import warn_missing_platform_keys
from .services.provider_errors import ProviderError
from .services.provider_probe import run_probe_loop as run_provider_probe
from .services.recording_sweeper import run_sweeper as run_recording_sweeper
from .services.status_probes import run_internal_probe_loop, run_provider_snapshot_loop
from .services.status_sweeper import run_status_sweeper
from .services.status_third_party import run_third_party_feed_loop
from .ws.board_ws import router as board_ws_router
from .ws.session_ws import router as session_ws_router

logger = logging.getLogger(__name__)


_SENSITIVE_KEYS = {"authorization", "api_key", "secret", "token", "password", "cookie"}


def _before_send(event: dict, hint: dict) -> dict | None:
    """Scrub PII and secrets from Sentry events before they leave the process."""
    request_data = event.get("request", {})
    headers = request_data.get("headers", {})
    for key in list(headers):
        if any(s in key.lower() for s in _SENSITIVE_KEYS):
            headers[key] = "[Filtered]"
    return event


def create_app() -> FastAPI:
    setup_logging()
    logger.info("Application starting")

    settings = get_settings()

    # Surface silent role→provider fallbacks (e.g. design configured for Gemini
    # but routing to Anthropic Sonnet because GOOGLE_API_KEY is empty). One-shot
    # warning at startup so the next operator notices before a $22/day bill.
    warn_missing_platform_keys()

    # --- Sentry error tracking (disabled when DSN is empty) ---
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            send_default_pii=False,
            before_send=_before_send,
        )
        logger.info("Sentry initialized (environment=%s)", settings.sentry_environment)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Local mode boots its own schema before serving: SQLite under
        # ~/.yeaboi, created fresh or migrated forward (local_bootstrap.py).
        if settings.local_mode:
            from .local_bootstrap import bootstrap_local_db

            await bootstrap_local_db()
        # Background tasks: kept tiny on purpose. Each runs in its own task,
        # cancelled cleanly on shutdown. Three of the probe loops make
        # outbound network calls, so a desktop install turns them off with
        # probes_enabled=False rather than phoning statuspage.io all day.
        background_tasks: list[asyncio.Task] = []
        if settings.probes_enabled:
            background_tasks = [
                asyncio.create_task(run_recording_sweeper()),
                asyncio.create_task(run_provider_probe()),
                asyncio.create_task(run_internal_probe_loop()),
                asyncio.create_task(run_provider_snapshot_loop()),
                asyncio.create_task(run_status_sweeper()),
                asyncio.create_task(run_third_party_feed_loop()),
            ]
        try:
            yield
        finally:
            for t in tuple(background_tasks):
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass

    app = FastAPI(title="yeaboi.ai", version="0.1.0", lifespan=lifespan)

    # --- OpenTelemetry distributed tracing (disabled when endpoint is empty) ---
    from .tracing import setup_tracing

    setup_tracing(app, settings)

    # Rate limiter state
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Provider errors (credit exhausted, invalid key, rate limited, etc.)
    # become structured JSON responses the frontend banner can target.
    async def _provider_error_handler(request: Request, exc: ProviderError):
        from fastapi.responses import JSONResponse

        envelope = exc.to_envelope()
        envelope["request_id"] = request_id_var.get("-")
        logger.warning(
            "Provider error %s on %s %s (provider=%s scope=%s)",
            exc.code,
            request.method,
            request.url.path,
            exc.provider,
            exc.scope,
        )
        return JSONResponse(status_code=exc.status_code, content={"error": envelope})

    app.add_exception_handler(ProviderError, _provider_error_handler)

    app.add_middleware(
        CORSMiddleware,
        # Local mode adds the Electron renderer's origins: the packaged
        # app:// scheme and the electron-vite dev server.
        allow_origins=settings.cors_origin_list
        + (["app://yeaboi", "http://localhost:5173", "http://localhost:5174"] if settings.local_mode else []),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Org-Id",
            "X-Team-Id",
            "X-Internal-Secret",
            "X-Request-Id",
            # The desktop app calls cross-origin (no Next proxy) and sends
            # W3C trace context with every request.
            "traceparent",
        ],
        expose_headers=["X-Request-Id", "X-Response-Time"],
    )

    # Security & request-size hardening — must register before CORS so they
    # run BEFORE it returns the response (Starlette middleware runs in reverse
    # registration order on the response path).
    from .middleware.security_headers import (
        BodySizeLimitMiddleware,
        SecurityHeadersMiddleware,
    )

    app.add_middleware(SecurityHeadersMiddleware, in_production=not settings.debug)
    app.add_middleware(BodySizeLimitMiddleware)

    # Error handling & request tracing (must be before CORS in registration order
    # so they run AFTER CORS in the middleware stack)
    app.add_middleware(GlobalExceptionMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(TimingMiddleware)

    if not settings.debug:
        # Local mode serves only loopback; 127.0.0.1 must not 400 there.
        allowed_hosts = [
            "planning-platform-production.up.railway.app",
            "planning-platform-zeta.vercel.app",
            "localhost",
        ]
        if settings.local_mode:
            allowed_hosts.append("127.0.0.1")
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    app.include_router(me_router)
    # Ahead of the session routers: its one static path, /api/sessions/
    # deepgram-token, is otherwise captured by /api/sessions/{session_id},
    # which FastAPI matches first because it is registered first.
    app.include_router(livekit_router)
    app.include_router(session_workspace_router)
    app.include_router(sessions_router)
    app.include_router(blueprints_router)
    app.include_router(blueprint_templates_router)
    app.include_router(ticket_templates_router)
    app.include_router(generation_presets_router)
    app.include_router(generation_options_router)
    app.include_router(video_avatars_router)
    app.include_router(character_previews_router)
    app.include_router(boards_router)
    app.include_router(card_attachments_router)
    app.include_router(session_attachments_router)
    app.include_router(card_links_router)
    app.include_router(card_views_router)
    app.include_router(integration_mappings_router)
    app.include_router(sync_actions_router)
    app.include_router(sync_webhooks_router)
    app.include_router(harness_router)
    app.include_router(session_outputs_router)
    app.include_router(orchestrator_router)
    app.include_router(transcripts_router)
    app.include_router(uploads_router)
    app.include_router(voice_notes_router)
    app.include_router(attachments_router)
    app.include_router(settings_router)
    app.include_router(team_router)
    app.include_router(invites_router)
    app.include_router(notifications_router)
    app.include_router(internal_router)
    app.include_router(organizations_router)
    app.include_router(ai_config_router)
    app.include_router(directory_router)
    app.include_router(feedback_router)
    app.include_router(chat_router)
    app.include_router(clips_router)
    app.include_router(livekit_webhooks_router)
    app.include_router(recordings_router)
    app.include_router(integrations_router)
    app.include_router(oauth_router)
    app.include_router(niko_router)
    app.include_router(analytics_router)
    app.include_router(admin_usage_router)
    app.include_router(admin_status_router)
    app.include_router(public_status_router)
    app.include_router(reports_router)
    app.include_router(report_subscriptions_router)
    app.include_router(vocabulary_router)
    app.include_router(voice_profile_router)
    app.include_router(team_last_viewed_router)
    app.include_router(team_slack_channels_router)
    app.include_router(slack_interactive_router)
    app.include_router(app_settings_router)
    app.include_router(themes_router)
    app.include_router(brand_router)
    app.include_router(system_health_router)
    app.include_router(health_router)
    app.include_router(session_ws_router)
    app.include_router(board_ws_router)

    @app.get("/api/health")
    @limiter.limit("120/minute")
    async def health(request: Request) -> dict:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/metrics", include_in_schema=False)
    @limiter.limit("60/minute")
    async def metrics(request: Request) -> Response:
        from prometheus_client import generate_latest

        return Response(content=generate_latest(), media_type="text/plain; version=0.0.4; charset=utf-8")

    # Serve uploaded files — create dir if it doesn't exist
    upload_dir = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    return app
