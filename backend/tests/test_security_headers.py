"""Smoke test that the security headers middleware is wired correctly."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_response_has_security_headers(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200

    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    # CSP ships in report-only mode initially; either header is acceptable.
    assert (
        "Content-Security-Policy-Report-Only" in resp.headers
        or "Content-Security-Policy" in resp.headers
    )
    # Permissions-Policy should allow camera/microphone for LiveKit and deny most other features.
    pp = resp.headers.get("Permissions-Policy", "")
    assert "camera=(self)" in pp
    assert "geolocation=()" in pp


@pytest.mark.asyncio
async def test_body_size_limit_rejects_oversized_request(client, auth_headers):
    # Synthesize a 12 MB Content-Length on a JSON-bodied route. The
    # middleware should 413 before the handler ever sees the request.
    headers = {**auth_headers, "Content-Length": str(12 * 1024 * 1024)}
    resp = await client.post(
        "/api/orgs/some-org/integrations",
        headers=headers,
        json={"provider": "x", "category": "x", "auth_type": "credential"},
    )
    assert resp.status_code == 413
    body = resp.json()
    assert "Request body too large" in body.get("error", "")
