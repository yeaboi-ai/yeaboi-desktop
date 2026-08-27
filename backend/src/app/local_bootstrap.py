"""Schema bootstrap for local mode (the yeaboi desktop sidecar).

A fresh install gets `Base.metadata.create_all()` and is stamped at alembic
head — the migration history is never replayed on SQLite, because a number of
the historical migrations use ALTER-constraint operations SQLite cannot run
(they predate the batch_alter_table policy). An existing database is migrated
forward with `alembic upgrade head`; migrations written after local mode
shipped use `op.batch_alter_table` and run fine on SQLite.

Runs inside the app's lifespan, before serving. Alembic's env.py calls
`asyncio.run()`, so the upgrade path executes in a worker thread rather than
on the already-running loop.
"""

import asyncio
import logging
from pathlib import Path

from sqlalchemy import text

from .config import get_settings
from .db import _get_engine
from .models import Base

logger = logging.getLogger(__name__)

def _alembic_dir() -> Path:
    """Where the migration scripts live.

    In the packaged wheel, alembic rides inside the package at app/_alembic
    (pyproject force-include); in a checkout it sits at backend/alembic.
    """
    packaged = Path(__file__).resolve().parent / "_alembic" / "alembic"
    if packaged.is_dir():
        return packaged
    return Path(__file__).resolve().parents[2] / "alembic"


def _alembic_config():
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(_alembic_dir()))
    return config


def _head_revision() -> str:
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(_alembic_config())
    head = script.get_current_head()
    if head is None:
        raise RuntimeError("alembic history has no head revision")
    return head


async def bootstrap_local_db() -> None:
    settings = get_settings()
    if not settings.database_url.startswith("sqlite"):
        logger.warning("local mode with a non-SQLite DATABASE_URL — skipping bootstrap")
        return

    engine = _get_engine()
    async with engine.connect() as connection:
        stamped = await connection.run_sync(_read_stamp)

    if stamped is None:
        head = _head_revision()
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.execute(
                text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)")
            )
            await connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:head)"),
                {"head": head},
            )
        logger.info("local db created fresh, stamped at %s", head)
        return

    if stamped == _head_revision():
        logger.info("local db already at head (%s)", stamped)
        return

    logger.info("local db at %s — upgrading to head", stamped)
    from alembic import command

    # env.py calls asyncio.run(); a worker thread gives it a loop of its own.
    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
    logger.info("local db upgraded to head")


def _read_stamp(sync_connection) -> str | None:
    """The stamped alembic revision, or None on a fresh database."""
    from sqlalchemy import inspect

    if not inspect(sync_connection).has_table("alembic_version"):
        return None
    row = sync_connection.execute(text("SELECT version_num FROM alembic_version")).fetchone()
    return row[0] if row else None
