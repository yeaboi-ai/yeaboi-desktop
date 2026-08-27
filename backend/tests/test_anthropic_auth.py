"""Claude subscription auth (services/anthropic_auth.py).

The desktop's local mode runs planning AI on the yeaboi TUI's one sign-in:
ANTHROPIC_AUTH_MODE + CLAUDE_CODE_OAUTH_TOKEN in ~/.yeaboi/.env. Both halves
must agree before the token is used, an explicit API key always wins, and a
re-sign-in (file rewrite) must propagate without a restart.
"""

import os
from pathlib import Path

import pytest

from src.app.services import anthropic_auth
from src.app.services.anthropic_auth import (
    anthropic_client_kwargs,
    get_subscription_token,
    has_anthropic_credential,
)


@pytest.fixture(autouse=True)
def clean_slate(monkeypatch, tmp_path: Path):
    """A fresh yeaboi home per test, with the process env cleared."""
    monkeypatch.setenv("YEABOI_HOME", str(tmp_path))
    monkeypatch.delenv("ANTHROPIC_AUTH_MODE", raising=False)
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    anthropic_auth._cache.clear()
    yield tmp_path
    anthropic_auth._cache.clear()


def _write_env(home: Path, *lines: str) -> None:
    (home / ".env").write_text("\n".join(lines) + "\n")


def test_no_file_no_env_means_key_auth():
    assert get_subscription_token() == ""
    assert not has_anthropic_credential("")
    assert anthropic_client_kwargs("") == {"api_key": ""}


def test_token_alone_is_not_enough(clean_slate: Path):
    # A logged-in Claude Code CLI must not hijack key auth.
    _write_env(clean_slate, "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-abc")
    assert get_subscription_token() == ""


def test_mode_alone_is_not_enough(clean_slate: Path):
    _write_env(clean_slate, "ANTHROPIC_AUTH_MODE=subscription")
    assert get_subscription_token() == ""
    assert not has_anthropic_credential("")


def test_both_halves_yield_the_token(clean_slate: Path):
    _write_env(
        clean_slate,
        "ANTHROPIC_AUTH_MODE=subscription",
        'CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat-abc"',
    )
    assert get_subscription_token() == "sk-ant-oat-abc"
    assert has_anthropic_credential("")
    kwargs = anthropic_client_kwargs("")
    assert kwargs["auth_token"] == "sk-ant-oat-abc"
    assert kwargs["default_headers"] == {"anthropic-beta": "oauth-2025-04-20"}
    assert "api_key" not in kwargs


def test_explicit_api_key_always_wins(clean_slate: Path):
    _write_env(
        clean_slate,
        "ANTHROPIC_AUTH_MODE=subscription",
        "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-abc",
    )
    assert anthropic_client_kwargs("sk-ant-api-real") == {"api_key": "sk-ant-api-real"}


def test_resign_in_propagates_without_restart(clean_slate: Path):
    _write_env(
        clean_slate,
        "ANTHROPIC_AUTH_MODE=subscription",
        "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-old",
    )
    assert get_subscription_token() == "sk-ant-oat-old"
    _write_env(
        clean_slate,
        "ANTHROPIC_AUTH_MODE=subscription",
        "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-new",
    )
    # A same-second rewrite can share an mtime; force the cache to notice.
    os.utime(clean_slate / ".env", (0, 2_000_000_000))
    assert get_subscription_token() == "sk-ant-oat-new"


def test_process_env_is_the_fallback(monkeypatch, clean_slate: Path):
    # No file in the home — env vars alone still work (hosted operator case).
    monkeypatch.setenv("ANTHROPIC_AUTH_MODE", "subscription")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat-env")
    assert get_subscription_token() == "sk-ant-oat-env"
