"""Centralized logging configuration.

Call setup_logging() once at app startup (in main.py:create_app).
"""

import contextvars
import logging
import logging.config
import os
from collections.abc import Awaitable, Callable
from typing import Any

# Context variables — set per-request by middleware / deps, read by ContextFilter.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
user_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("user_id", default="-")
org_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("org_id", default="-")


class ContextFilter(logging.Filter):
    """Injects request_id, user_id, org_id, trace_id, and span_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        from opentelemetry import trace as oteltrace

        record.request_id = request_id_var.get("-")  # type: ignore[attr-defined]
        record.user_id = user_id_var.get("-")  # type: ignore[attr-defined]
        record.org_id = org_id_var.get("-")  # type: ignore[attr-defined]

        span = oteltrace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            record.trace_id = format(ctx.trace_id, "032x")  # type: ignore[attr-defined]
            record.span_id = format(ctx.span_id, "016x")  # type: ignore[attr-defined]
        else:
            record.trace_id = "-"  # type: ignore[attr-defined]
            record.span_id = "-"  # type: ignore[attr-defined]
        return True


def propagate_context(func: Callable[..., Awaitable[Any]], *args: Any, **kwargs: Any) -> Callable[[], Awaitable[Any]]:
    """Capture current context vars and return a wrapper that restores them.

    Use with FastAPI BackgroundTasks so background work inherits the
    request's tracing context (request_id, user_id, org_id) and
    OpenTelemetry trace context.

    Usage::

        background_tasks.add_task(propagate_context(my_func, arg1, arg2))
    """
    from opentelemetry import context as otel_context

    rid = request_id_var.get("-")
    uid = user_id_var.get("-")
    oid = org_id_var.get("-")
    otel_ctx = otel_context.get_current()

    async def _wrapped() -> Any:
        request_id_var.set(rid)
        user_id_var.set(uid)
        org_id_var.set(oid)
        otel_context.attach(otel_ctx)
        return await func(*args, **kwargs)

    return _wrapped


def setup_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_format = os.getenv("LOG_FORMAT", "text").lower()

    if log_format == "json":
        formatter_config = {
            "class": "pythonjsonlogger.json.JsonFormatter",
            "format": (
                "%(asctime)s %(levelname)s %(name)s %(request_id)s %(user_id)s"
                " %(org_id)s %(trace_id)s %(span_id)s %(message)s"
            ),
        }
    else:
        formatter_config = {
            "format": (
                "%(asctime)s %(levelname)-8s [%(request_id)s] [%(trace_id).12s]"
                " %(user_id)s %(org_id)s %(name)s: %(message)s"
            ),
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "context": {
                    "()": ContextFilter,
                },
            },
            "formatters": {
                "default": formatter_config,
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "formatter": "default",
                    "filters": ["context"],
                },
            },
            "root": {
                "level": log_level,
                "handlers": ["console"],
            },
            "loggers": {
                # Route uvicorn access logs through our formatter (with request_id)
                # but keep them at INFO so they're visible in dev and production.
                "uvicorn.access": {"level": "INFO", "handlers": ["console"], "propagate": False},
                "uvicorn.error": {"level": "INFO", "handlers": ["console"], "propagate": False},
                "httpx": {"level": "WARNING"},
                "httpcore": {"level": "WARNING"},
                "hpack": {"level": "WARNING"},
            },
        }
    )
