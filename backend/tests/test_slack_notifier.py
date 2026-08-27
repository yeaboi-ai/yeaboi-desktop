"""Tests for the Slack notifier primitives.

The module was refactored to expose only low-level posting primitives
(_post_to_channel, _load_slack_token, load_admin_team_id) plus the
legacy build_scan_blocks helper. Routing moved to slack_dispatcher.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.services.connectors.slack_notifier import (
    _load_slack_token,
    _post_to_channel,
    build_scan_blocks,
    load_admin_team_id,
)


@pytest.mark.asyncio
async def test_post_to_channel_returns_ts_on_ok():
    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.json = lambda: {"ok": True, "ts": "1700000000.000100"}
    with patch("src.app.services.connectors.slack_notifier.httpx.AsyncClient") as client_cls:
        client_cls.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_resp)
        ts = await _post_to_channel("xoxb-token", "C1", "hi", None)
    assert ts == "1700000000.000100"


@pytest.mark.asyncio
async def test_post_to_channel_returns_none_on_slack_error():
    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.json = lambda: {"ok": False, "error": "channel_not_found"}
    with patch("src.app.services.connectors.slack_notifier.httpx.AsyncClient") as client_cls:
        client_cls.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_resp)
        ts = await _post_to_channel("xoxb-token", "C1", "hi", None)
    assert ts is None


@pytest.mark.asyncio
async def test_post_to_channel_returns_none_on_http_error():
    fake_resp = MagicMock()
    fake_resp.status_code = 500
    fake_resp.text = "internal error"
    with patch("src.app.services.connectors.slack_notifier.httpx.AsyncClient") as client_cls:
        client_cls.return_value.__aenter__.return_value.post = AsyncMock(return_value=fake_resp)
        ts = await _post_to_channel("xoxb-token", "C1", "hi", None)
    assert ts is None


@pytest.mark.asyncio
async def test_post_to_channel_swallows_exceptions():
    with patch("src.app.services.connectors.slack_notifier.httpx.AsyncClient") as client_cls:
        client_cls.return_value.__aenter__.return_value.post = AsyncMock(side_effect=RuntimeError("boom"))
        ts = await _post_to_channel("xoxb-token", "C1", "hi", None)
    assert ts is None


@pytest.mark.asyncio
async def test_load_slack_token_returns_none_when_no_integration(db_session, sample_org):
    token = await _load_slack_token(db_session, sample_org.id)
    assert token is None


@pytest.mark.asyncio
async def test_load_admin_team_id_returns_none_when_no_integration(db_session, sample_org):
    value = await load_admin_team_id(db_session, sample_org.id)
    assert value is None


def test_build_scan_blocks_includes_title_and_body():
    blocks = build_scan_blocks(
        "scan_complete", "GitHub", "GitHub scan complete",
        "5 repos scanned, 3 created, 2 updated",
    )
    dumped = str(blocks)
    assert "GitHub scan complete" in dumped
    assert "5 repos scanned" in dumped


def test_build_scan_blocks_uses_event_specific_icon():
    assert ":mag:" in str(build_scan_blocks("scan_started", "AWS", "Started", None))
    assert ":white_check_mark:" in str(build_scan_blocks("scan_complete", "AWS", "Done", None))
    assert ":x:" in str(build_scan_blocks("scan_failed", "AWS", "Failed", "err"))
    assert ":warning:" in str(build_scan_blocks("scan_partial", "AWS", "Partial", "some failed"))
    assert ":bell:" in str(build_scan_blocks("unknown", "Jira", "Title", None))


def test_build_scan_blocks_truncates_very_long_body():
    blocks = build_scan_blocks("scan_complete", "GitHub", "Done", "x" * 5000)
    body_text = blocks[1]["text"]["text"]
    assert len(body_text) <= 2500
