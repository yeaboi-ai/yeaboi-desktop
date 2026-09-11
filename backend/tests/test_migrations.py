"""The migrations are the only part of this backend that runs unattended.

`bootstrap_local_db` calls `alembic upgrade head` inside the FastAPI lifespan
on every installed desktop app, with nobody in the loop and no downgrade to
fall back on. Every other test builds its database with `create_all`, so
without this the riskiest code in the tree has no coverage at all.

The assertion is the one that matters: an upgraded install and a fresh one must
end up with the same schema. A missing index or a dropped `ondelete` is
invisible until it is someone's data.
"""

from __future__ import annotations

import asyncio
import sqlite3
import subprocess
import uuid
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from src.app.models.base import Base

#: The revision immediately before the projects purge.
BEFORE_THE_PURGE = "k2l3m4n5o6p7"
ROOT = Path(__file__).resolve().parents[1]


def _alembic(db: Path, *args: str) -> None:
    result = subprocess.run(
        ["uv", "run", "alembic", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env={**__import__("os").environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db}"},
    )
    if result.returncode:
        raise AssertionError(f"alembic {args} failed:\n{result.stdout}\n{result.stderr}")


def _create_all(db: Path) -> None:
    async def build() -> None:
        engine = create_async_engine(f"sqlite+aiosqlite:///{db}")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(build())


def _shape(db: Path) -> dict[str, dict]:
    """Columns, foreign keys and indexes per table — everything that can drift."""
    con = sqlite3.connect(db)
    try:
        out: dict[str, dict] = {}
        names = [
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'"
            )
        ]
        for table in names:
            out[table] = {
                "columns": {(r[1], (r[2] or "").upper(), r[3]) for r in con.execute(f"PRAGMA table_info({table})")},
                "foreign_keys": {
                    (f[3], f[2], f[4], f[6]) for f in con.execute(f"PRAGMA foreign_key_list({table})")
                },
                "indexes": {
                    r[1]
                    for r in con.execute(f"PRAGMA index_list({table})")
                    if not r[1].startswith("sqlite_autoindex")
                },
            }
        return out
    finally:
        con.close()


@pytest.fixture
def upgraded(tmp_path: Path) -> Path:
    """A real pre-collapse database, seeded, then upgraded to head."""
    db = tmp_path / "upgraded.db"
    con = sqlite3.connect(db)
    try:
        con.executescript((ROOT / "tests" / "fixtures" / "pre_collapse_schema.sql").read_text())
    finally:
        con.close()
    _seed(db)
    _alembic(db, "stamp", BEFORE_THE_PURGE)
    _alembic(db, "upgrade", "head")
    return db


def _seed(db: Path) -> None:
    """One row in each table the purge has to empty, so it is not a no-op."""
    con = sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys=OFF")
    ids = {name: uuid.uuid4().hex for name in ("org", "user", "team", "project", "session", "iteration")}

    def insert(table: str, **values: object) -> None:
        info = {row[1]: row for row in con.execute(f"PRAGMA table_info({table})")}
        values = {k: v for k, v in values.items() if k in info}
        for name, row in info.items():
            # Fill any other NOT NULL column create_all left without a default.
            if name in values or row[3] == 0 or row[4] is not None or row[5]:
                continue
            values[name] = 0 if "INT" in (row[2] or "").upper() else ""
        con.execute(
            f"INSERT INTO {table} ({','.join(values)}) VALUES ({','.join('?' * len(values))})",
            list(values.values()),
        )

    insert("organizations", id=ids["org"], name="Org", slug="org")
    insert("users", id=ids["user"], email="a@b.c", name="A", role="admin", org_id=ids["org"])
    insert("teams", id=ids["team"], org_id=ids["org"], name="T", slug="t", last_viewed_project_id=ids["project"])
    insert(
        "projects",
        id=ids["project"],
        org_id=ids["org"],
        team_id=ids["team"],
        owner_id=ids["user"],
        name="P",
        key="P",
        status="active",
        card_counter=0,
        is_demo=0,
        default_modifiers="[]",
        reference_links="[]",
    )
    insert(
        "sessions",
        id=ids["session"],
        project_id=ids["project"],
        org_id=ids["org"],
        status="active",
        join_code="jc",
        ai_config="{}",
        blueprint_review_status="none",
    )
    insert(
        "blueprint_iterations",
        id=ids["iteration"],
        project_id=ids["project"],
        org_id=ids["org"],
        iteration_number=1,
        label="v1",
        status="ready",
    )
    insert(
        "blueprint_snapshots",
        id=uuid.uuid4().hex,
        project_id=ids["project"],
        session_id=ids["session"],
        org_id=ids["org"],
        iteration_id=ids["iteration"],
        version_number=1,
        content="{}",
        created_by="user",
    )
    insert("boards", id=uuid.uuid4().hex, project_id=ids["project"], org_id=ids["org"], iteration_id=ids["iteration"])
    con.commit()
    con.close()


def test_an_upgraded_database_matches_a_fresh_one(upgraded: Path, tmp_path: Path) -> None:
    fresh = tmp_path / "fresh.db"
    _create_all(fresh)

    migrated_shape, fresh_shape = _shape(upgraded), _shape(fresh)
    differences: list[str] = []
    for table in sorted(set(migrated_shape) | set(fresh_shape)):
        if table not in fresh_shape:
            differences.append(f"{table}: exists only after an upgrade")
            continue
        if table not in migrated_shape:
            differences.append(f"{table}: exists only on a fresh install")
            continue
        for aspect, noun in (("columns", "column"), ("foreign_keys", "foreign key"), ("indexes", "index")):
            only_migrated = migrated_shape[table][aspect] - fresh_shape[table][aspect]
            only_fresh = fresh_shape[table][aspect] - migrated_shape[table][aspect]
            for item in sorted(only_migrated, key=str):
                differences.append(f"{table}: upgraded has {noun} {item}")
            for item in sorted(only_fresh, key=str):
                differences.append(f"{table}: fresh has {noun} {item}")
    assert not differences, "\n".join(differences)


def test_the_projects_table_is_gone_and_nothing_still_points_at_it(upgraded: Path) -> None:
    con = sqlite3.connect(upgraded)
    try:
        tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "projects" not in tables
        dangling = [
            (table, fk[3])
            for table in tables
            for fk in con.execute(f"PRAGMA foreign_key_list({table})")
            if fk[2] == "projects"
        ]
        assert not dangling, f"foreign keys still reference the dropped table: {dangling}"
        con.execute("PRAGMA foreign_keys=ON")
        assert con.execute("PRAGMA foreign_key_check").fetchall() == []
        assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        con.close()
