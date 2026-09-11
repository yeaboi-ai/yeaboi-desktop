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
import json
import logging
import shutil
import sqlite3
from datetime import UTC, datetime
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


#: The revision that deletes every project. A database stamped before it is
#: about to lose rows, so it is copied first.
_DESTRUCTIVE = "rm01_purge_projects"

#: Where the purge records what it saved, so the app can tell the user. Sits
#: beside the database rather than in it — the row would be inside the very
#: file the note is about.
BACKUP_MARKER = "last-backup.json"


def _needs_backup(stamped: str) -> bool:
    """Whether `stamped` sits before the destructive revision.

    Walks the history from head down to `stamped`; the destructive revision is
    still ahead of this database when it turns up on the way.
    """
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(_alembic_config())
    try:
        pending = {rev.revision for rev in script.iterate_revisions("heads", stamped)}
    except Exception:  # noqa: BLE001 - an unreadable history must not block startup
        logger.warning("could not read the migration history; assuming a backup is needed")
        return True
    return _DESTRUCTIVE in pending


def _sqlite_path(database_url: str) -> Path | None:
    """The file behind a sqlite URL, or None for anything else (`:memory:` included)."""
    _, _, tail = database_url.partition(":///")
    return Path(tail) if tail and tail != ":memory:" else None


def back_up_before_purge(database_url: str, upload_dir: str) -> Path | None:
    """Copy the database and its uploads before the purge. Returns the copy.

    The online-backup API, never a file copy: WAL mode means the newest pages
    live in `-wal`, so a plain copy of the `.db` alone is a torn file. Raises
    when the copy cannot be made — losing data to an update nobody asked for is
    worse than not starting.
    """
    source = _sqlite_path(database_url)
    if source is None or not source.exists():
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = source.with_name(f"{source.name}.pre-projects-removed-{stamp}.bak")

    free = shutil.disk_usage(source.parent).free
    needed = source.stat().st_size * 2
    if free < needed:
        raise RuntimeError(
            f"not enough room to back up {source} before the projects purge "
            f"({needed} bytes needed, {free} free) — free some space and start again"
        )

    with sqlite3.connect(source) as src, sqlite3.connect(target) as dest:
        src.backup(dest)
    logger.warning("projects are being removed; the previous database is at %s", target)

    uploads = Path(upload_dir)
    kept: Path | None = None
    if uploads.is_dir():
        kept = uploads.with_name(f"{uploads.name}.pre-projects-removed-{stamp}")
        shutil.copytree(uploads, kept, dirs_exist_ok=False)
        logger.warning("project attachments were copied to %s", kept)

    marker = source.with_name(BACKUP_MARKER)
    marker.write_text(
        json.dumps(
            {
                "database": str(target),
                "uploads": str(kept) if kept else None,
                "taken_at": datetime.now(UTC).isoformat(),
                "reason": "projects_removed",
            },
            indent=2,
        )
    )
    return target


def read_backup_marker() -> dict | None:
    """What the last purge saved, or None if none ever ran here."""
    source = _sqlite_path(get_settings().database_url)
    if source is None:
        return None
    marker = source.with_name(BACKUP_MARKER)
    if not marker.is_file():
        return None
    try:
        return json.loads(marker.read_text())
    except (OSError, ValueError):
        logger.warning("could not read the backup marker at %s", marker)
        return None


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
    if _needs_backup(stamped):
        # Unattended: nobody chose this upgrade, so nobody can be asked first.
        await asyncio.to_thread(back_up_before_purge, settings.database_url, settings.upload_dir)
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
