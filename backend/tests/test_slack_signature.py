import hashlib
import hmac
import time

from src.app.services.slack_signature import verify_slack_request

SECRET = "test-signing-secret"


def _sign(timestamp: str, body: bytes) -> str:
    base = f"v0:{timestamp}:{body.decode()}".encode()
    digest = hmac.new(SECRET.encode(), base, hashlib.sha256).hexdigest()
    return f"v0={digest}"


def test_valid_signature_passes():
    ts = str(int(time.time()))
    body = b"token=foo&team_id=T1"
    assert verify_slack_request(SECRET, ts, _sign(ts, body), body) is True


def test_tampered_body_fails():
    ts = str(int(time.time()))
    body = b"token=foo&team_id=T1"
    sig = _sign(ts, body)
    assert verify_slack_request(SECRET, ts, sig, b"token=foo&team_id=T2") is False


def test_stale_timestamp_fails():
    ts = str(int(time.time()) - 301)
    body = b"x"
    assert verify_slack_request(SECRET, ts, _sign(ts, body), body) is False


def test_empty_signing_secret_fails():
    ts = str(int(time.time()))
    body = b"x"
    assert verify_slack_request("", ts, _sign(ts, body), body) is False


def test_future_timestamp_fails():
    ts = str(int(time.time()) + 301)
    body = b"x"
    assert verify_slack_request(SECRET, ts, _sign(ts, body), body) is False
