"""Slack request signature verification per https://api.slack.com/authentication/verifying-requests-from-slack."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

logger = logging.getLogger(__name__)

MAX_AGE_SECONDS = 300  # 5 minutes — Slack's recommended replay window


def verify_slack_request(signing_secret: str, timestamp: str, signature: str, body: bytes) -> bool:
    """Return True iff the signature + body + timestamp are a valid Slack-signed request."""
    if not signing_secret:
        logger.warning("Slack signature check invoked without signing secret")
        return False
    try:
        ts_int = int(timestamp)
    except (TypeError, ValueError):
        return False

    if abs(time.time() - ts_int) > MAX_AGE_SECONDS:
        return False

    base = f"v0:{timestamp}:{body.decode(errors='replace')}".encode()
    expected = "v0=" + hmac.new(signing_secret.encode(), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
