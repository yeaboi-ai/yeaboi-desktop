"""On-demand report generation + delivery endpoints.

Reports are renderer-agnostic — same data, different output formats. PDF
needs WeasyPrint; if it isn't installed we return 503 with a clear message
so the UI can disable the PDF button rather than the user seeing a 500."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.organization import Organization
from ..models.user import User
from ..services.reports.assembler import build_report
from ..services.reports.delivery.email import deliver_email
from ..services.reports.delivery.slack import deliver_slack, has_slack_integration, resolve_slack_token
from ..services.reports.renderers.markdown import render_markdown
from ..services.reports.renderers.pdf import PdfRendererUnavailable, is_available, render_pdf

# Minimal email validation — we don't need RFC-perfection, just enough to
# reject obvious typos before we hand the list to Resend (which will do its
# own validation server-side anyway).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


ReportFormat = Literal["pdf", "markdown"]


class GenerateRequest(BaseModel):
    scope: Literal["org", "project", "session"] = "org"
    id: str | None = None
    format: ReportFormat = "markdown"
    start: datetime | None = None
    end: datetime | None = None


class SendRequest(BaseModel):
    scope: Literal["org", "project", "session"] = "org"
    id: str | None = None
    format: ReportFormat = "pdf"
    start: datetime | None = None
    end: datetime | None = None
    email_recipients: list[str] = Field(default_factory=list)
    slack_channel: str | None = None
    subject: str | None = None

    @field_validator("email_recipients")
    @classmethod
    def _validate_emails(cls, value: list[str]) -> list[str]:
        for v in value:
            if not _EMAIL_RE.match(v):
                raise ValueError(f"invalid email: {v!r}")
        return value


class SendResponse(BaseModel):
    email: dict | None = None
    slack: dict | None = None
    report_summary: dict


def _scope_args(req: GenerateRequest | SendRequest) -> str | None:
    """The session a report is scoped to, or None for the whole org.

    `project` and `session` name the same row now; both are accepted so an
    older client keeps working.
    """
    if req.scope in ("project", "session"):
        if not req.id:
            raise HTTPException(status_code=422, detail=f"id is required when scope={req.scope}")
        return req.id
    return None


def _render(report, fmt: ReportFormat):
    if fmt == "markdown":
        return render_markdown(report)
    if fmt == "pdf":
        try:
            return render_pdf(report)
        except PdfRendererUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=422, detail=f"unknown format: {fmt}")


@router.get("/capabilities")
async def get_capabilities(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> dict:
    """What renderers + delivery channels are available right now. The UI
    uses this to disable buttons it can't honour:
      - PDF: WeasyPrint installed in the backend image
      - Email: Resend API key configured globally (single tenant SaaS key)
      - Slack: this org has completed the Slack OAuth flow

    Slack is per-org because each workspace has its own bot token, stored
    on the matching `OrgIntegration` row after install."""
    from ..config import get_settings

    settings = get_settings()
    return {
        "formats": {"markdown": True, "pdf": is_available()},
        "delivery": {
            "email": bool(settings.resend_api_key),
            "slack": await has_slack_integration(db, org.id),
        },
    }


@router.post("/generate")
async def generate_report(
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> Response:
    """Build and render a report; return the file inline as a download.

    Synchronous and capped — the assembler streams from the analytics SQL
    layer so even a 30-day org-wide rollup typically completes in under a
    second on the seed data."""
    session_id = _scope_args(req)
    report = await build_report(
        db,
        org=org,
        session_id=session_id,
        start=req.start,
        end=req.end,
    )
    rendered = _render(report, req.format)
    return Response(
        content=rendered.content,
        media_type=rendered.mimetype,
        headers={"Content-Disposition": f'attachment; filename="{rendered.filename}"'},
    )


@router.post("/send")
async def send_report(
    req: SendRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> SendResponse:
    """Build, render, and dispatch a report via email and/or Slack.

    Either `email_recipients` or `slack_channel` (or both) must be set —
    otherwise the call has no effect and we 422 to surface the misuse."""
    if not req.email_recipients and not req.slack_channel:
        raise HTTPException(status_code=422, detail="provide email_recipients and/or slack_channel")

    session_id = _scope_args(req)
    report = await build_report(
        db,
        org=org,
        session_id=session_id,
        start=req.start,
        end=req.end,
    )
    rendered = _render(report, req.format)

    subject = req.subject or f"Analytics — {report.scope.label} ({report.range.label()})"

    email_status = None
    slack_status = None
    if req.email_recipients:
        email_status = deliver_email(
            rendered=rendered,
            recipients=list(req.email_recipients),
            subject=subject,
            body_text=(
                f"Attached: analytics report for {report.scope.label} "
                f"({report.range.label()}). Total spend "
                f"${float(report.total_cost_usd):,.2f}."
            ),
        )
    if req.slack_channel:
        bot_token = await resolve_slack_token(db, org.id)
        if not bot_token:
            slack_status = {
                "delivered": False,
                "error": "Slack is not connected for this org. Install the Slack app from Settings → Integrations.",
            }
        else:
            slack_status = deliver_slack(
                report=report,
                rendered=rendered,
                channel=req.slack_channel,
                bot_token=bot_token,
            )

    return SendResponse(
        email=email_status,
        slack=slack_status,
        report_summary={
            "scope": report.scope.label,
            "range": report.range.label(),
            "total_usd": float(report.total_cost_usd),
            "is_partially_estimated": report.is_partially_estimated,
            "format": req.format,
            "filename": rendered.filename,
        },
    )
