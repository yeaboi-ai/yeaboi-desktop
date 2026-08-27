"""Integration scan connectors."""

import logging

logger = logging.getLogger(__name__)


async def dispatch_scan(
    provider: str, integration_id: str, org_id: str, team_id: str, scan_log_id: str
) -> None:
    """Dispatch a scan to the appropriate connector. Runs as a background task."""
    from ...db import get_session_factory

    try:
        async with get_session_factory()() as db:
            from .scan_runner import ScanRunner

            runner = ScanRunner(
                db=db, integration_id=integration_id, org_id=org_id, team_id=team_id, scan_log_id=scan_log_id
            )

            if provider == "github":
                from .github_scan import run as github_run

                await github_run(runner, db)
            elif provider == "aws":
                from .aws_scan import run as aws_run

                await aws_run(runner, db)
            elif provider == "jira":
                from .jira_scan import run as jira_run

                await jira_run(runner, db)
            elif provider == "confluence":
                from .confluence_scan import run as confluence_run

                await confluence_run(runner, db)
            elif provider == "azure_devops":
                from .azure_devops_scan import run as ado_run

                await ado_run(runner, db)
            elif provider == "slack":
                from .slack_scan import run as slack_run

                await slack_run(runner, db)
            else:
                logger.error("No scan connector for provider: %s", provider)
                return
    except Exception:
        logger.exception("Scan dispatch failed: provider=%s integration=%s", provider, integration_id)
