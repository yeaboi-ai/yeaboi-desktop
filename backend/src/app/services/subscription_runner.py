"""Execute a `ReportSubscription`: build the report, render the requested
formats, dispatch to every channel, write a `SubscriptionRun` audit row,
and update `last_run_at` / `next_run_at` on the subscription."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.organization import Organization
from ..models.report_subscription import ReportSubscription, SubscriptionRun
from .reports.assembler import build_report
from .reports.delivery.email import deliver_email
from .reports.delivery.slack import deliver_slack, resolve_slack_token
from .reports.renderers.markdown import render_markdown
from .reports.renderers.pdf import PdfRendererUnavailable, render_pdf
from .schedule_math import compute_next_run

logger = logging.getLogger(__name__)


def _project_id_for(sub: ReportSubscription) -> str | None:
    return sub.scope_id if sub.scope_kind == "project" else None


def _session_id_for(sub: ReportSubscription) -> str | None:
    return sub.scope_id if sub.scope_kind == "session" else None


async def run_subscription(db: AsyncSession, subscription_id: str) -> SubscriptionRun:
    """Synchronous run for `subscription_id`. Always writes a SubscriptionRun
    even on failure — the caller (scheduler or /run endpoint) trusts the
    audit row to surface what happened."""
    sub = (
        await db.execute(select(ReportSubscription).where(ReportSubscription.id == subscription_id))
    ).scalar_one_or_none()
    if sub is None or sub.deleted_at is not None:
        raise ValueError(f"subscription {subscription_id} not found or deleted")

    org = (await db.execute(select(Organization).where(Organization.id == sub.org_id))).scalar_one()

    run = SubscriptionRun(subscription_id=sub.id, status="running")
    db.add(run)
    await db.flush()

    deliveries: list[dict] = []
    try:
        report = await build_report(
            db,
            org=org,
            project_id=_project_id_for(sub),
            session_id=_session_id_for(sub),
        )

        rendered_by_format = {}
        for fmt in sub.formats or ["markdown"]:
            try:
                if fmt == "pdf":
                    rendered_by_format[fmt] = render_pdf(report)
                else:
                    rendered_by_format[fmt] = render_markdown(report)
            except PdfRendererUnavailable as exc:
                deliveries.append({"format": fmt, "skipped": True, "reason": str(exc)})
                continue

        # Resolve the org's Slack bot token once if any channel needs it —
        # avoids hitting the OrgIntegration table per-format/per-channel.
        slack_token: str | None = None
        if any((c.get("kind") == "slack") for c in (sub.channels or [])):
            slack_token = await resolve_slack_token(db, sub.org_id)

        # Dispatch each channel × each rendered format. Most users will
        # configure one format per channel; the matrix keeps it general.
        for channel in sub.channels or []:
            kind = channel.get("kind")
            target = channel.get("target")
            for fmt, rendered in rendered_by_format.items():
                if kind == "email":
                    res = deliver_email(
                        rendered=rendered,
                        recipients=[target] if isinstance(target, str) else list(target or []),
                        subject=f"Analytics — {report.scope.label} ({report.range.label()})",
                        body_text=(
                            f"Scheduled {sub.frequency} report.\nTotal spend ${float(report.total_cost_usd):,.2f}."
                        ),
                    )
                    deliveries.append({"channel": "email", "target": target, "format": fmt, **res})
                elif kind == "slack":
                    if not slack_token:
                        deliveries.append(
                            {
                                "channel": "slack",
                                "target": target,
                                "format": fmt,
                                "delivered": False,
                                "error": "Slack not connected for this org",
                            }
                        )
                        continue
                    res = deliver_slack(
                        report=report, rendered=rendered, channel=target, bot_token=slack_token
                    )
                    deliveries.append({"channel": "slack", "target": target, "format": fmt, **res})
                else:
                    deliveries.append({"channel": kind, "skipped": True, "reason": "unknown channel kind"})

        run.status = "succeeded"
        run.deliveries = deliveries
    except Exception as exc:
        logger.exception("subscription run failed: %s", subscription_id)
        run.status = "failed"
        run.error = str(exc)[:1900]
        run.deliveries = deliveries
    finally:
        run.finished_at = datetime.now(UTC)
        sub.last_run_at = run.finished_at
        sub.next_run_at = compute_next_run(
            frequency=sub.frequency,
            schedule_config=sub.schedule_config,
            after=run.finished_at,
        )
        await db.commit()
        await db.refresh(run)
    return run
