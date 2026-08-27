"""OpenTelemetry distributed tracing setup.

Call ``setup_tracing(app, settings)`` from ``main.py:create_app()`` after the
FastAPI app is created.  Tracing is disabled when ``settings.otel_exporter_endpoint``
is empty — zero overhead in that case.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

if TYPE_CHECKING:
    from fastapi import FastAPI

    from .config import Settings

logger = logging.getLogger(__name__)

# Module-level tracer — always safe to use.  When tracing is disabled the
# default no-op tracer is returned, so callers never need to guard usage.
tracer = trace.get_tracer("planning-platform")


def setup_tracing(app: FastAPI, settings: Settings) -> None:
    """Initialise OpenTelemetry and auto-instrument FastAPI, SQLAlchemy, httpx."""

    if not settings.otel_exporter_endpoint:
        return

    resource = Resource.create({"service.name": settings.otel_service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Re-bind the module-level tracer so manual spans use the real provider.
    global tracer  # noqa: PLW0603
    tracer = trace.get_tracer("planning-platform")

    # --- Auto-instrumentors ---
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()

    # SQLAlchemy — instrument the engine once it's created.
    from .db import _get_engine

    engine = _get_engine()
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)

    logger.info(
        "OpenTelemetry tracing enabled (exporter=%s, service=%s)",
        settings.otel_exporter_endpoint,
        settings.otel_service_name,
    )
