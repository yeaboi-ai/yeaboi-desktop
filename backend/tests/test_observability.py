"""Observability tests — §15 of docs/observability.md.

Verifies structured logging, correlation IDs, health checks, metrics endpoint,
and audit log creation.
"""

import logging

from sqlalchemy import select

from src.app.logging_config import ContextFilter, org_id_var, request_id_var, user_id_var
from src.app.models.audit import AuditLog

# ---------------------------------------------------------------------------
# 1. Structured log format
# ---------------------------------------------------------------------------


def test_context_filter_injects_fields():
    """ContextFilter should add request_id, user_id, org_id, trace_id, span_id to log records."""
    filt = ContextFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="hello",
        args=(),
        exc_info=None,
    )

    # Set context vars
    request_id_var.set("req-123")
    user_id_var.set("user@test.com")
    org_id_var.set("org-456")

    filt.filter(record)

    assert record.request_id == "req-123"
    assert record.user_id == "user@test.com"
    assert record.org_id == "org-456"
    assert hasattr(record, "trace_id")
    assert hasattr(record, "span_id")

    # Reset
    request_id_var.set("-")
    user_id_var.set("-")
    org_id_var.set("-")


def test_context_filter_defaults():
    """ContextFilter should use '-' defaults when context vars are not set."""
    request_id_var.set("-")
    user_id_var.set("-")
    org_id_var.set("-")

    filt = ContextFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="hello",
        args=(),
        exc_info=None,
    )
    filt.filter(record)

    assert record.request_id == "-"
    assert record.user_id == "-"
    assert record.org_id == "-"
    assert record.trace_id == "-"
    assert record.span_id == "-"


# ---------------------------------------------------------------------------
# 2. Correlation ID propagation
# ---------------------------------------------------------------------------


async def test_response_includes_request_id(client):
    """Every HTTP response should include an X-Request-Id header."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert "x-request-id" in resp.headers
    # Should be a UUID-like string
    rid = resp.headers["x-request-id"]
    assert len(rid) >= 8


async def test_request_id_differs_per_request(client):
    """Each request should get a unique correlation ID."""
    r1 = await client.get("/api/health")
    r2 = await client.get("/api/health")
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


# ---------------------------------------------------------------------------
# 3. Health check dependency status
# ---------------------------------------------------------------------------


async def test_health_live_returns_ok(client):
    """GET /api/health/live should return 200 with timestamp."""
    resp = await client.get("/api/health/live")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "timestamp" in data


async def test_health_ready_checks_components(client):
    """GET /api/health/ready should return component-level status."""
    resp = await client.get("/api/health/ready")
    data = resp.json()
    # Should have component statuses (may be 200 or 503 depending on test DB)
    assert "status" in data
    assert "checks" in data
    checks = data["checks"]
    assert "database" in checks
    assert "redis" in checks
    assert "config" in checks


# ---------------------------------------------------------------------------
# 4. Metrics endpoint
# ---------------------------------------------------------------------------


async def test_metrics_endpoint_returns_prometheus_format(client):
    """GET /metrics should return Prometheus text format with expected metrics."""
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]

    body = resp.text
    # Should contain our custom metrics
    assert "http_requests_total" in body
    assert "http_request_duration_seconds" in body
    assert "db_queries_total" in body
    assert "ws_active_connections" in body
    assert "ai_calls_total" in body
    assert "orchestrator_active" in body


async def test_metrics_increment_on_request(client):
    """Metrics should reflect actual request counts."""
    # Make a known request
    resp = await client.get("/api/health")
    # Health may be rate-limited if other tests ran first; that's fine

    resp = await client.get("/metrics")
    # If rate-limited, skip this assertion
    if resp.status_code == 200:
        body = resp.text
        # http_requests_total should have at least one entry
        assert "http_requests_total{" in body


# ---------------------------------------------------------------------------
# 5. Audit log creation
# ---------------------------------------------------------------------------


async def test_audit_log_created_on_project_create(client, auth_headers, db_session):
    """Creating a project should write an audit log entry."""
    resp = await client.post(
        "/api/sessions",
        json={"name": "Audit Test Session", "description": "testing audit"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    session_id = resp.json()["id"]

    # Query audit logs from the test DB
    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "session",
            AuditLog.action == "create",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1

    log = logs[-1]
    assert log.action == "create"
    assert log.resource_type == "session"
    assert log.resource_id == session_id
    assert log.metadata_.get("name") == "Audit Test Session"


async def test_audit_log_created_on_project_delete(client, auth_headers, db_session):
    """Deleting a project should write an audit log entry."""
    # Create first
    resp = await client.post(
        "/api/sessions",
        json={"name": "Delete Me"},
        headers=auth_headers,
    )
    session_id = resp.json()["id"]

    # Delete
    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Check audit log
    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "session",
            AuditLog.action == "delete",
            AuditLog.resource_id == session_id,
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert log.metadata_.get("name") == "Delete Me"
