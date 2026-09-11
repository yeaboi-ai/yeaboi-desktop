"""Tests for the reports assembler, renderers, delivery, and HTTP endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from src.app.models.organization import Organization, OrgMember
from src.app.models.usage_event import UsageEvent
from src.app.models.user import User
from src.app.services.reports.assembler import build_report
from src.app.services.reports.delivery.email import deliver_email
from src.app.services.reports.delivery.slack import deliver_slack
from src.app.services.reports.model import RenderedReport
from src.app.services.reports.renderers.markdown import render_markdown
from src.app.services.reports.renderers.pdf import PdfRendererUnavailable, is_available, render_pdf

# ── Fixtures ─────────────────────────────────────────────────────────────


async def _bootstrap_auth_org(client, auth_headers, db_session):
    resp = await client.get("/api/sessions", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    from tests.conftest import TEST_USER_EMAIL

    user = (await db_session.execute(select(User).where(User.email == TEST_USER_EMAIL))).scalar_one()
    membership = (await db_session.execute(select(OrgMember).where(OrgMember.user_id == user.id))).scalar_one()
    org = (await db_session.execute(select(Organization).where(Organization.id == membership.org_id))).scalar_one()
    return org


@pytest.fixture
async def auth_for_org(client, auth_headers, db_session):
    return await _bootstrap_auth_org(client, auth_headers, db_session)


@pytest.fixture
async def populated_org(client, auth_headers, db_session, auth_for_org):
    """Auth org + one session + a couple of usage_event rows.
    Gives the assembler something to summarise."""
    proj = await client.post("/api/sessions", json={"name": "Reports Proj"}, headers=auth_headers)
    proj_id = proj.json()["id"]
    base_time = datetime.now(UTC) - timedelta(hours=2)
    db_session.add_all(
        [
            UsageEvent(
                org_id=auth_for_org.id,
                session_id=proj_id,
                provider="anthropic",
                operation="chat",
                model="claude-opus-4-7",
                units={"tokens_in": 1000, "tokens_out": 500},
                cost_usd=Decimal("0.0525"),
                is_estimated=False,
                source="api",
                occurred_at=base_time,
            ),
            UsageEvent(
                org_id=auth_for_org.id,
                session_id=proj_id,
                provider="elevenlabs",
                operation="tts",
                units={"characters": 8000},
                cost_usd=Decimal("1.44"),
                is_estimated=True,  # estimated row
                source="backfill",
                occurred_at=base_time + timedelta(minutes=5),
            ),
        ]
    )
    await db_session.commit()
    return {"org": auth_for_org, "session_id": proj_id}


# ── Assembler ────────────────────────────────────────────────────────────


class TestAssembler:
    async def test_org_scope_aggregates_all(self, db_session, populated_org):
        report = await build_report(db_session, org=populated_org["org"])
        assert report.scope.kind == "org"
        # Anthropic 0.0525 + ElevenLabs 1.44 = 1.4925
        assert report.total_cost_usd == Decimal("1.4925")
        assert report.is_partially_estimated is True
        providers = {line.provider for line in report.cost_lines}
        assert providers == {"anthropic", "elevenlabs"}
        # cost_lines sorted by spend desc → elevenlabs first
        assert report.cost_lines[0].provider == "elevenlabs"
        assert len(report.sessions) == 1

    async def test_session_scope_filters_to_that_session(self, db_session, populated_org):
        report = await build_report(db_session, org=populated_org["org"], session_id=populated_org["session_id"])
        assert report.scope.kind == "session"
        assert report.scope.label.startswith("Reports Proj")
        assert report.total_cost_usd == Decimal("1.4925")
        assert len(report.sessions) == 1

    async def test_empty_range_yields_zero_cost(self, db_session, auth_for_org):
        report = await build_report(db_session, org=auth_for_org)
        assert report.total_cost_usd == Decimal("0")
        assert report.cost_lines == []
        assert report.is_partially_estimated is False

    async def test_summary_includes_estimated_share(self, db_session, populated_org):
        report = await build_report(db_session, org=populated_org["org"])
        # Estimated 1.44 / total 1.4925 ≈ 96.48%
        assert 96 < report.summary["estimated_share_pct"] < 97


# ── Markdown renderer ────────────────────────────────────────────────────


class TestMarkdownRenderer:
    async def test_renders_with_expected_sections(self, db_session, populated_org):
        report = await build_report(db_session, org=populated_org["org"])
        rendered = render_markdown(report)
        assert rendered.mimetype == "text/markdown"
        assert rendered.filename.endswith(".md")
        body = rendered.content.decode("utf-8")
        assert "Analytics report" in body
        assert "## Total spend" in body
        assert "## By provider" in body
        assert "## Top sessions" in body
        # Estimated banner only when applicable.
        assert "estimated" in body.lower()
        # Numbers come through as currency.
        assert "$1.49" in body or "$1.4925" in body or "$1.49" in body

    async def test_no_estimated_banner_when_authoritative(self, db_session, populated_org):
        # Wipe the estimated row so the banner shouldn't render.
        await db_session.execute(UsageEvent.__table__.delete().where(UsageEvent.is_estimated.is_(True)))
        await db_session.commit()
        report = await build_report(db_session, org=populated_org["org"])
        rendered = render_markdown(report)
        body = rendered.content.decode("utf-8")
        assert "Includes estimated values" not in body


# ── PDF renderer (smoke + unavailable path) ─────────────────────────────


class TestPdfRenderer:
    async def test_unavailable_raises_clear_error_when_missing(self, db_session, populated_org):
        if is_available():
            pytest.skip("WeasyPrint is installed in this env")
        report = await build_report(db_session, org=populated_org["org"])
        with pytest.raises(PdfRendererUnavailable, match="WeasyPrint"):
            render_pdf(report)

    async def test_renders_pdf_bytes_when_available(self, db_session, populated_org):
        if not is_available():
            pytest.skip("WeasyPrint not installed; skipping PDF render smoke test")
        report = await build_report(db_session, org=populated_org["org"])
        rendered = render_pdf(report)
        assert rendered.mimetype == "application/pdf"
        assert rendered.content[:4] == b"%PDF"


# ── Delivery (mocked clients) ────────────────────────────────────────────


class TestDelivery:
    def test_email_skips_without_api_key(self, monkeypatch):
        from src.app.config import get_settings

        monkeypatch.setenv("RESEND_API_KEY", "")
        get_settings.cache_clear()

        result = deliver_email(
            rendered=RenderedReport(content=b"hi", mimetype="text/markdown", filename="x.md"),
            recipients=["a@b.com"],
            subject="s",
            body_text="b",
        )
        assert result["delivered_to"] == []
        assert "Resend" in (result["error"] or "")

    def test_email_attaches_and_calls_send_per_recipient(self, monkeypatch):
        from src.app.config import get_settings

        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        get_settings.cache_clear()

        captured = []
        with patch("resend.Emails.send") as send:
            send.side_effect = lambda payload: captured.append(payload) or {"id": "msg"}
            result = deliver_email(
                rendered=RenderedReport(content=b"hi", mimetype="text/markdown", filename="x.md"),
                recipients=["a@b.com", "c@d.com"],
                subject="Subj",
                body_text="Body",
            )
        assert result["delivered_to"] == ["a@b.com", "c@d.com"]
        assert len(captured) == 2
        assert captured[0]["subject"] == "Subj"
        assert captured[0]["attachments"][0]["filename"] == "x.md"

    def test_email_partial_success_when_one_fails(self, monkeypatch):
        from src.app.config import get_settings

        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        get_settings.cache_clear()

        with patch("resend.Emails.send") as send:
            send.side_effect = [None, Exception("bounce")]
            result = deliver_email(
                rendered=RenderedReport(content=b"x", mimetype="text/markdown", filename="x.md"),
                recipients=["good@x.com", "bad@x.com"],
                subject="s",
                body_text="b",
            )
        assert result["delivered_to"] == ["good@x.com"]
        assert result["skipped"] == ["bad@x.com"]

    async def test_slack_requires_token(self, db_session, populated_org):
        # Empty bot_token (org hasn't connected Slack) → graceful failure.
        report = await build_report(db_session, org=populated_org["org"])
        result = deliver_slack(
            report=report,
            rendered=RenderedReport(content=b"x", mimetype="text/markdown", filename="x.md"),
            channel="#general",
            bot_token="",
        )
        assert result["delivered"] is False
        assert "Slack" in (result["error"] or "") or "connected" in (result["error"] or "").lower()

    async def test_slack_posts_message_and_uploads_file(self, db_session, populated_org):
        report = await build_report(db_session, org=populated_org["org"])
        rendered = RenderedReport(content=b"hi", mimetype="text/markdown", filename="x.md")

        responses = [
            MagicMock(json=lambda: {"ok": True, "ts": "1.2"}),  # chat.postMessage
            MagicMock(json=lambda: {"ok": True, "upload_url": "https://up", "file_id": "F1"}),  # getUploadURL
            MagicMock(json=lambda: {"ok": True}),  # PUT bytes
            MagicMock(json=lambda: {"ok": True}),  # files.completeUploadExternal
        ]

        with patch("httpx.Client") as client_cls:
            instance = client_cls.return_value.__enter__.return_value
            instance.post.side_effect = responses
            result = deliver_slack(
                report=report,
                rendered=rendered,
                channel="C123",
                bot_token="xoxb-test",
            )
        assert result["delivered"] is True
        assert result["file_uploaded"] is True


# ── HTTP endpoints ───────────────────────────────────────────────────────


class TestReportsEndpoints:
    async def test_capabilities_reports_pdf_availability(self, client, auth_headers):
        resp = await client.get("/api/reports/capabilities", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "formats" in body and "delivery" in body
        assert body["formats"]["markdown"] is True
        # PDF availability depends on the env; just assert the key exists.
        assert "pdf" in body["formats"]

    async def test_capabilities_slack_false_when_org_not_connected(self, client, auth_headers, populated_org):
        # No OrgIntegration row for slack → capability reports false.
        resp = await client.get("/api/reports/capabilities", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["delivery"]["slack"] is False

    async def test_capabilities_slack_true_when_org_has_active_integration(
        self, client, auth_headers, db_session, populated_org
    ):
        from src.app.models.integration import OrgIntegration
        from src.app.services.crypto import encrypt_api_key

        # Connect Slack for this org — mirrors what the OAuth callback does.
        db_session.add(
            OrgIntegration(
                org_id=populated_org["org"].id,
                provider="slack",
                category="messaging",
                auth_type="oauth",
                status="active",
                access_token=encrypt_api_key("xoxb-fake-token"),
                connected_by=populated_org["org"].id,  # any user id is fine for test
            )
        )
        await db_session.commit()

        resp = await client.get("/api/reports/capabilities", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["delivery"]["slack"] is True

    async def test_generate_returns_markdown_attachment(self, client, auth_headers, populated_org):
        resp = await client.post(
            "/api/reports/generate",
            json={"scope": "org", "format": "markdown"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/markdown")
        assert "attachment" in resp.headers["content-disposition"]
        assert "Analytics report" in resp.text

    async def test_generate_pdf_503_when_weasyprint_missing(self, client, auth_headers, populated_org):
        if is_available():
            pytest.skip("WeasyPrint installed; can't exercise the 503 path")
        resp = await client.post(
            "/api/reports/generate",
            json={"scope": "org", "format": "pdf"},
            headers=auth_headers,
        )
        assert resp.status_code == 503
        assert "WeasyPrint" in resp.json()["detail"]

    async def test_generate_project_scope_requires_id(self, client, auth_headers):
        resp = await client.post(
            "/api/reports/generate",
            json={"scope": "project", "format": "markdown"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_send_requires_at_least_one_channel(self, client, auth_headers, populated_org):
        resp = await client.post(
            "/api/reports/send",
            json={"scope": "org", "format": "markdown"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_send_with_email_returns_delivery_status(self, client, auth_headers, populated_org, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from src.app.config import get_settings

        get_settings.cache_clear()
        with patch("resend.Emails.send", return_value={"id": "msg"}):
            resp = await client.post(
                "/api/reports/send",
                json={
                    "scope": "org",
                    "format": "markdown",
                    "email_recipients": ["someone@example.com"],
                },
                headers=auth_headers,
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"]["delivered_to"] == ["someone@example.com"]
        assert body["report_summary"]["scope"]
        assert body["report_summary"]["filename"].endswith(".md")
