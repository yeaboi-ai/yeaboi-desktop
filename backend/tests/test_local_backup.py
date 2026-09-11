"""The projects purge saves before it runs, and says where."""

import json
import shutil
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.app.local_bootstrap import BACKUP_MARKER, back_up_before_purge, read_backup_marker


def test_backup_copies_the_database_and_records_where(tmp_path, monkeypatch):
    db = tmp_path / "planning.db"
    with sqlite3.connect(db) as con:
        con.execute("CREATE TABLE projects (id TEXT)")
        con.execute("INSERT INTO projects VALUES ('p1')")
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "shot.png").write_bytes(b"x")

    target = back_up_before_purge(f"sqlite+aiosqlite:///{db}", str(uploads))

    assert target is not None and target.exists()
    with sqlite3.connect(target) as con:
        assert con.execute("SELECT id FROM projects").fetchone() == ("p1",)

    marker = json.loads((tmp_path / BACKUP_MARKER).read_text())
    assert marker["database"] == str(target)
    assert Path(marker["uploads"]).is_dir()

    import src.app.local_bootstrap as lb

    monkeypatch.setattr(lb, "get_settings", lambda: SimpleNamespace(database_url=f"sqlite+aiosqlite:///{db}"))
    assert read_backup_marker() == marker


def test_backup_is_none_when_there_is_no_database(tmp_path):
    assert back_up_before_purge(f"sqlite+aiosqlite:///{tmp_path / 'missing.db'}", str(tmp_path)) is None


def test_backup_refuses_when_the_disk_is_full(tmp_path, monkeypatch):
    db = tmp_path / "planning.db"
    with sqlite3.connect(db) as con:
        con.execute("CREATE TABLE t (id TEXT)")
    monkeypatch.setattr(shutil, "disk_usage", lambda _p: SimpleNamespace(free=0))
    with pytest.raises(RuntimeError, match="not enough room"):
        back_up_before_purge(f"sqlite+aiosqlite:///{db}", str(tmp_path))


def test_marker_is_none_before_any_purge(tmp_path, monkeypatch):
    import src.app.local_bootstrap as lb

    db = tmp_path / "planning.db"
    db.write_bytes(b"")
    monkeypatch.setattr(lb, "get_settings", lambda: SimpleNamespace(database_url=f"sqlite+aiosqlite:///{db}"))
    assert read_backup_marker() is None
