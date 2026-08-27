"""Claude subscription auth for the platform Anthropic client.

The yeaboi TUI signs a user into their Claude subscription with `claude
setup-token` and persists two values in ~/.yeaboi/.env:

    ANTHROPIC_AUTH_MODE=subscription
    CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...

When this backend runs as the desktop's local sidecar, that one sign-in
should power planning AI too — so the token is honoured here, mirroring
yeaboi/config.py::get_anthropic_subscription_token: both halves must agree
(mode says subscription AND a token is stored) before the token is used.
Returning it on presence alone would silently hijack a working API key for
anyone whose Claude Code CLI happens to be logged in.

The token is re-read from ~/.yeaboi/.env (mtime-cached) rather than from the
process env, because the sidecar's env is frozen at spawn and a re-sign-in in
Settings must propagate without a backend restart. Outside local mode the
process env alone applies, which keeps the hosted deployment's behaviour
unchanged unless an operator sets the two variables deliberately.
"""

import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# The Anthropic SDK sends auth_token as `Authorization: Bearer`; this beta
# header is what makes the API accept a subscription OAuth token.
OAUTH_BETA_HEADER = {"anthropic-beta": "oauth-2025-04-20"}

_cache: dict[str, tuple[float, dict[str, str]]] = {}


def _read_env_file(path: Path) -> dict[str, str]:
    """The minimal dotenv subset the TUI writes: KEY=value, quotes, comments."""
    values: dict[str, str] = {}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def _shared_env() -> dict[str, str]:
    """~/.yeaboi/.env, cached by mtime. Empty outside a yeaboi home."""
    home = os.environ.get("YEABOI_HOME", "")
    path = Path(home).expanduser() / ".env" if home else Path.home() / ".yeaboi" / ".env"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    key = str(path)
    cached = _cache.get(key)
    if cached and cached[0] == mtime:
        return cached[1]
    values = _read_env_file(path)
    _cache[key] = (mtime, values)
    return values


def _lookup(name: str) -> str:
    file_values = _shared_env()
    # The file is the live source (a re-sign-in rewrites it); the process env
    # is the fallback for deployments with no yeaboi home at all.
    return (file_values.get(name) or os.environ.get(name, "")).strip()


def get_subscription_token() -> str:
    """The Claude subscription token to authenticate with, or "" for key auth."""
    if _lookup("ANTHROPIC_AUTH_MODE").lower() != "subscription":
        return ""
    return _lookup("CLAUDE_CODE_OAUTH_TOKEN")


_warned_at = 0.0


def anthropic_client_kwargs(api_key: str) -> dict:
    """The credential kwargs for AsyncAnthropic: subscription first, key second.

    An explicit API key always wins — subscription auth only fills the gap
    when no key is configured, so nobody's paid key is silently bypassed.
    """
    global _warned_at
    if api_key:
        return {"api_key": api_key}
    token = get_subscription_token()
    if token:
        now = time.monotonic()
        if now - _warned_at > 3600:
            _warned_at = now
            logger.info("Anthropic auth: using Claude subscription token (no API key set)")
        return {"auth_token": token, "default_headers": dict(OAUTH_BETA_HEADER)}
    return {"api_key": api_key}


def has_anthropic_credential(api_key: str) -> bool:
    """Either credential counts: an API key, or a signed-in subscription."""
    return bool(api_key or get_subscription_token())
