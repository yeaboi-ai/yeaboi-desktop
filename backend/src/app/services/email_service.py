import asyncio
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)


async def _record_resend_send(
    *,
    org_id: str | None,
    project_id: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    count: int = 1,
) -> None:
    """Append a `email_send` row to the usage_events ledger.

    No-op when org_id is None — callers without org context just don't bill.
    Opens its own DB session so a slow insert can't block the email path.
    """
    if not org_id or count <= 0:
        return
    try:
        from ..db import get_session_factory
        from .usage_recorder import UsageContext, record_resend_email

        factory = get_session_factory()
        async with factory() as db:
            ctx = UsageContext(
                org_id=org_id,
                project_id=project_id,
                session_id=session_id,
                user_id=user_id,
            )
            await record_resend_email(db, ctx, count=count)
            await db.commit()
    except Exception:
        logger.exception("resend usage_events ledger write failed")


async def send_invite_email(
    to_email: str,
    inviter_name: str,
    inviter_email: str,
    invite_token: str | None = None,
    *,
    org_id: str | None = None,
    user_id: str | None = None,
) -> bool:
    """Send a team invite email via Resend. Returns True on success."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("No Resend API key — invite email not sent")
        return False

    try:
        import resend

        resend.api_key = settings.resend_api_key

        if invite_token:
            join_url = f"{settings.app_url}/invite/{invite_token}"
        else:
            join_url = f"{settings.app_url}/team"

        # The resend SDK is sync — push the HTTPS round-trip off the event
        # loop so we don't block other requests (this is now on the org
        # creation hot path).
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": "Planning Platform <onboarding@resend.dev>",
                "to": [to_email],
                "subject": f"{inviter_name} invited you to Planning Platform",
                "html": f"""
            <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="font-size: 24px; font-weight: 600; color: #f0f0f0; margin-bottom: 8px;">You're invited</h1>
                <p style="color: #858585; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                    <strong style="color: #f0f0f0;">{inviter_name}</strong> ({inviter_email}) has invited you to join their team on Planning Platform.
                </p>
                <a href="{join_url}" style="display: inline-block; background: #e5a630; color: #0a0a0a; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    Accept invitation
                </a>
                <p style="color: #555; font-size: 12px; margin-top: 32px;">
                    If you didn't expect this invitation, you can ignore this email.
                </p>
            </div>
            """,
            },
        )
        logger.info("Invite email sent to %s", to_email)
        await _record_resend_send(org_id=org_id, user_id=user_id, count=1)
        return True

    except Exception as e:
        logger.error("Failed to send invite email: %s", e)
        return False


async def send_session_recap_email(
    *,
    to_emails: list[str],
    session_title: str,
    duration_seconds: int | None,
    transcript_lines: list[str],
    summary: str | None = None,
    org_id: str | None = None,
    session_id: str | None = None,
    project_id: str | None = None,
) -> int:
    """Send a session recap email to each address. Returns count of successful sends.

    transcript_lines: pre-formatted lines like "10:42  Alice: hello there" — the
    caller decides what to include (already-redacted text only).
    """
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("No Resend API key — recap email not sent")
        return 0
    if not to_emails:
        return 0

    duration_label = ""
    if duration_seconds is not None and duration_seconds >= 0:
        m, s = divmod(duration_seconds, 60)
        duration_label = f" · {m}m {s}s"

    # Cap transcript at ~200 lines to stay under Resend's body limits.
    capped = transcript_lines[:200]
    truncated_note = (
        '<p style="color:#666;font-size:12px;">…transcript truncated to 200 lines.</p>'
        if len(transcript_lines) > 200
        else ""
    )
    transcript_html = (
        '<pre style="font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; '
        "color:#cfcfcf; background:#161616; padding:16px; border-radius:8px; overflow:auto; "
        'white-space:pre-wrap;">'
        + "\n".join(line.replace("<", "&lt;").replace(">", "&gt;") for line in capped)
        + "</pre>"
        + truncated_note
    )
    summary_html = (
        f'<h2 style="font-size:14px;color:#f0f0f0;margin:24px 0 8px;">Summary</h2>'
        f'<p style="color:#bbb;font-size:13px;line-height:1.6;">{summary}</p>'
        if summary
        else ""
    )

    try:
        import resend

        resend.api_key = settings.resend_api_key
        succeeded = 0
        for to_email in to_emails:
            try:
                await asyncio.to_thread(
                    resend.Emails.send,
                    {
                        "from": "Planning Platform <onboarding@resend.dev>",
                        "to": [to_email],
                        "subject": f"Recap: {session_title}{duration_label}",
                        "html": f"""
                        <div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:0 auto;padding:32px 20px;background:#0a0a0a;color:#f0f0f0;">
                            <h1 style="font-size:20px;font-weight:600;margin:0 0 4px;">{session_title}</h1>
                            <p style="color:#858585;font-size:13px;margin:0 0 24px;">Session recap{duration_label}</p>
                            {summary_html}
                            <h2 style="font-size:14px;color:#f0f0f0;margin:24px 0 8px;">Transcript</h2>
                            {transcript_html}
                            <p style="color:#555;font-size:11px;margin-top:32px;">
                                You're receiving this because you participated in this planning session.
                            </p>
                        </div>
                        """,
                    },
                )
                succeeded += 1
            except Exception as inner:
                logger.warning("Recap email to %s failed: %s", to_email, inner)
        logger.info("Sent recap email to %d/%d recipients", succeeded, len(to_emails))
        await _record_resend_send(
            org_id=org_id,
            session_id=session_id,
            project_id=project_id,
            count=succeeded,
        )
        return succeeded

    except Exception as e:
        logger.error("Failed to send recap email batch: %s", e)
        return 0
