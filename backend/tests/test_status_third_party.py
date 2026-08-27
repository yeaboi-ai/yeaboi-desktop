"""Third-party status-feed parsing."""

from src.app.models.status import (
    STATUS_DEGRADED,
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    STATUS_PARTIAL_OUTAGE,
)
from src.app.services.status_third_party import _parse_feed, _statuspage_indicator_to_int


def test_statuspage_indicator_mapping():
    assert _statuspage_indicator_to_int("none") == STATUS_OPERATIONAL
    assert _statuspage_indicator_to_int("minor") == STATUS_DEGRADED
    assert _statuspage_indicator_to_int("major") == STATUS_PARTIAL_OUTAGE
    assert _statuspage_indicator_to_int("critical") == STATUS_MAJOR_OUTAGE
    assert _statuspage_indicator_to_int("unknown-vendor-string") == STATUS_OPERATIONAL


def test_parse_statuspage_summary_payload():
    payload = {"status": {"indicator": "major", "description": "Partial outage"}}
    assert _parse_feed(payload) == STATUS_PARTIAL_OUTAGE


def test_parse_slack_v2_active():
    assert _parse_feed({"status": "active", "service_id": "abc"}) == STATUS_OPERATIONAL


def test_parse_slack_v2_inactive():
    assert _parse_feed({"status": "inactive", "service_id": "abc"}) == STATUS_DEGRADED


def test_parse_garbage_payload():
    assert _parse_feed("not-a-dict") == STATUS_OPERATIONAL
    assert _parse_feed({}) == STATUS_OPERATIONAL
