import logging
import time
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = logging.getLogger(__name__)

_engine = None
_session_factory = None

# Queries slower than this (ms) are logged at WARNING level.
_SLOW_QUERY_MS = 100


def _get_engine():
    global _engine
    if _engine is None:
        from .config import get_settings

        settings = get_settings()
        # SQLite (used for in-memory tests via aiosqlite) defaults to StaticPool
        # and rejects pool_size / max_overflow as invalid kwargs. Only pass
        # those to real pooled drivers like asyncpg/psycopg in production.
        engine_kwargs: dict = {"echo": False}
        if not settings.database_url.startswith("sqlite"):
            engine_kwargs["pool_size"] = 5
            engine_kwargs["max_overflow"] = 10
        _engine = create_async_engine(settings.database_url, **engine_kwargs)
        if settings.database_url.startswith("sqlite"):
            # A file-backed SQLite DB (the desktop's local mode) wants WAL for
            # crash safety and concurrent readers. In-memory test DBs accept
            # the pragma harmlessly (it reports "memory" and moves on).
            @event.listens_for(_engine.sync_engine, "connect")
            def _sqlite_wal(dbapi_connection, _record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.close()

        _register_query_timing(_engine.sync_engine)
    return _engine


def _register_query_timing(sync_engine) -> None:
    """Attach SQLAlchemy event listeners to log slow queries."""

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.perf_counter())

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after_execute(conn, cursor, statement, parameters, context, executemany):
        from .metrics import DB_QUERY_COUNT, DB_QUERY_LATENCY

        starts = conn.info.get("query_start_time")
        if starts:
            duration_s = time.perf_counter() - starts.pop()
            DB_QUERY_COUNT.inc()
            DB_QUERY_LATENCY.observe(duration_s)
            duration_ms = duration_s * 1000
            if duration_ms > _SLOW_QUERY_MS:
                logger.warning("Slow query (%.0fms): %.200s", duration_ms, statement)


def get_session_factory() -> async_sessionmaker:
    """Return the async session factory. Used by background tasks that need their own DB session."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(_get_engine(), class_=AsyncSession, expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        yield session
