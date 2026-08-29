"""Email delivery for rendered reports — Resend API."""

from __future__ import annotations

import base64
import logging

from ....config import get_settings
from ..model import RenderedReport

logger = logging.getLogger(__name__)


def deliver_email(
    *,
    rendered: RenderedReport,
    recipients: list[str],
    subject: str,
    body_text: str,
) -> dict:
    """Send the rendered report as an email attachment via Resend.

    Returns `{delivered_to: [...], skipped: [...], error: str | None}`.
    Never raises — caller wants a partial success accounting, not an
    all-or-nothing exception."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Skipping email delivery — RESEND_API_KEY not configured")
        return {"delivered_to": [], "skipped": recipients, "error": "Resend API key not configured"}
    if not recipients:
        return {"delivered_to": [], "skipped": [], "error": None}

    try:
        import resend

        resend.api_key = settings.resend_api_key
        delivered: list[str] = []
        skipped: list[str] = []
        for to in recipients:
            try:
                resend.Emails.send(
                    {
                        "from": "yeaboi.ai <onboarding@resend.dev>",
                        "to": [to],
                        "subject": subject,
                        "text": body_text,
                        "attachments": [
                            {
                                "filename": rendered.filename,
                                "content": base64.b64encode(rendered.content).decode("ascii"),
                            }
                        ],
                    }
                )
                delivered.append(to)
            except Exception as exc:
                logger.warning("Report email to %s failed: %s", to, exc)
                skipped.append(to)
        return {"delivered_to": delivered, "skipped": skipped, "error": None}
    except Exception as exc:
        logger.error("Report email batch failed: %s", exc)
        return {"delivered_to": [], "skipped": recipients, "error": str(exc)}
