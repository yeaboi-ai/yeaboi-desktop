"""Jira scan connector — fetches projects, sprints, and issues via Atlassian REST API.

Scans Jira Cloud via OAuth 2.0 tokens, fetches projects with their active/future
sprints and recent issues, runs per-project AI analysis via Sonnet, writes
DirectoryEntry records for each project and an overall delivery health summary.
"""

import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ...services.ai_provider import get_ai_client
from ...services.crypto import decrypt_api_key
from .prompting import system_prompt
from .scan_runner import ScanRunner, with_retry

logger = logging.getLogger(__name__)

ATLASSIAN_API = "https://api.atlassian.com"

# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def _build_project_prompt(project: dict, issues: list[dict], sprints: list[dict]) -> str:
    """Build an AI prompt for a single Jira project.

    Includes project key, name, lead, sprint info, and recent issues (up to 30)
    with key, summary, status, type, and priority.

    Args:
        project: Jira project dict with key, name, and optional lead.
        issues: List of issue dicts from the Jira search API.
        sprints: List of sprint dicts from the Jira agile API.

    Returns:
        Complete prompt string for AI analysis.
    """
    key = project.get("key", "")
    name = project.get("name", "")
    lead = project.get("lead", {})
    lead_name = lead.get("displayName", "Unknown") if lead else "Unknown"

    parts = [
        f"Jira Project: {key} — {name}",
        f"Lead: {lead_name}",
        "",
    ]

    # Sprint info
    if sprints:
        parts.append("--- Sprints ---")
        for sprint in sprints:
            state = sprint.get("state", "unknown")
            sprint_name = sprint.get("name", "Unnamed sprint")
            goal = sprint.get("goal", "")
            line = f"- {sprint_name} (state: {state})"
            if goal:
                line += f" — goal: {goal}"
            parts.append(line)
        parts.append("")

    # Recent issues (up to 100) with assignee + updated time for cycle-time signal
    if issues:
        parts.append("--- Recent Issues (most-recent first) ---")
        for issue in issues[:100]:
            fields = issue.get("fields", {})
            issue_key = issue.get("key", "")
            summary = fields.get("summary", "")
            status = fields.get("status", {}).get("name", "Unknown")
            issue_type = fields.get("issuetype", {}).get("name", "Unknown")
            priority = fields.get("priority", {}).get("name", "Unknown")
            assignee = (fields.get("assignee") or {}).get("displayName") or "Unassigned"
            updated = fields.get("updated", "")[:10]  # ISO date portion
            parts.append(
                f"- [{issue_key}] {summary} | {issue_type} | {status} | {priority} | "
                f"{assignee} | updated {updated}"
            )
        # Aggregate stats for the AI
        status_counts: dict[str, int] = {}
        type_counts: dict[str, int] = {}
        for issue in issues:
            fields = issue.get("fields", {})
            status_counts[fields.get("status", {}).get("name", "Unknown")] = (
                status_counts.get(fields.get("status", {}).get("name", "Unknown"), 0) + 1
            )
            type_counts[fields.get("issuetype", {}).get("name", "Unknown")] = (
                type_counts.get(fields.get("issuetype", {}).get("name", "Unknown"), 0) + 1
            )
        parts.append("")
        parts.append("--- Aggregates ---")
        parts.append(f"By status: {status_counts}")
        parts.append(f"By type: {type_counts}")
        parts.append("")

    parts.append(
        "Analyze this Jira project's delivery health. Cover: sprint progress, issue distribution "
        "by status and type, priority breakdown, potential blockers or risks, velocity indicators. "
        "Write a concise markdown summary (200-400 words)."
    )

    return "\n".join(parts)


def _build_health_prompt(projects: list[dict], sprints: list[dict], total_issues: int) -> str:
    """Build an AI prompt for overall delivery health across all Jira projects.

    Args:
        projects: List of project dicts with key and name.
        sprints: Aggregated list of all sprint dicts across projects.
        total_issues: Total number of issues across all projects.

    Returns:
        Complete prompt string for AI analysis.
    """
    parts = [
        "Overall Jira Delivery Health",
        f"Total projects: {len(projects)}",
        f"Total issues scanned: {total_issues}",
        "",
    ]

    # Project list
    if projects:
        parts.append("--- Projects ---")
        for proj in projects:
            parts.append(f"- {proj.get('key', '')} — {proj.get('name', '')}")
        parts.append("")

    # Sprint overview
    if sprints:
        parts.append("--- Active/Future Sprints ---")
        for sprint in sprints:
            state = sprint.get("state", "unknown")
            sprint_name = sprint.get("name", "Unnamed sprint")
            goal = sprint.get("goal", "")
            line = f"- {sprint_name} (state: {state})"
            if goal:
                line += f" — goal: {goal}"
            parts.append(line)
        parts.append("")

    parts.append(
        "Provide an overall delivery health summary across all projects. Cover: cross-project "
        "velocity, sprint health, risk areas, resource concerns, and recommendations. "
        "Write a concise markdown summary (200-400 words)."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Jira API helpers
# ---------------------------------------------------------------------------


@with_retry
async def _jira_get(client: httpx.AsyncClient, url: str, headers: dict) -> dict | list | None:
    """Make an authenticated GET request to the Jira/Atlassian API.

    Returns parsed JSON on success, or None on error (non-2xx).

    Args:
        client: httpx async client.
        url: Full URL to fetch.
        headers: Auth headers (Bearer token).

    Returns:
        Parsed JSON response or None.
    """
    resp = await client.get(url, headers=headers)

    if resp.status_code == 404:
        return None
    resp.raise_for_status()

    return resp.json()


@with_retry
async def _jira_post(client: httpx.AsyncClient, url: str, headers: dict, body: dict) -> dict | list | None:
    """Make an authenticated POST request to the Jira API with a JSON body."""
    resp = await client.post(url, headers={**headers, "Content-Type": "application/json"}, json=body)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point: authenticate via OAuth, list projects, scan each.

    Decrypts the OAuth access token from the integration record, resolves the
    Atlassian cloud site ID, lists all Jira projects, fetches issues and sprints
    per project, runs AI analysis, and writes directory entries.

    Args:
        runner: Pre-configured ScanRunner instance.
        db: Active database session.
    """
    await runner.start(scan_type="full")

    try:
        # 1. Load integration and decrypt OAuth token
        result = await db.execute(select(OrgIntegration).where(OrgIntegration.id == runner.integration_id))
        integration = result.scalar_one_or_none()

        if not integration:
            await runner.fail("Integration not found")
            return

        if not integration.access_token:
            await runner.fail("No Jira OAuth token configured")
            return

        token = decrypt_api_key(integration.access_token)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # 2. Get cloud site ID via accessible-resources
            resources = await _jira_get(client, f"{ATLASSIAN_API}/oauth/token/accessible-resources", headers)
            if not resources or not isinstance(resources, list) or len(resources) == 0:
                await runner.fail("No accessible Jira sites found")
                return

            cloud_id = resources[0]["id"]
            jira_base = f"{ATLASSIAN_API}/ex/jira/{cloud_id}"
            logger.info("Jira cloud site resolved: %s", cloud_id)

            # 3. List projects
            projects_resp = await _jira_get(client, f"{jira_base}/rest/api/3/project/search", headers)
            if not projects_resp or not isinstance(projects_resp, dict):
                await runner.fail("Failed to list Jira projects")
                return

            projects = projects_resp.get("values", [])
            if not projects:
                logger.warning("No Jira projects found")
                await runner.complete()
                return

            # Filter to the projects the user opted in to, if any are set.
            included_scopes: list[str] | None = None
            if integration.metadata_json:
                try:
                    meta = json.loads(integration.metadata_json)
                    if isinstance(meta.get("included_scopes"), list):
                        included_scopes = [str(s) for s in meta["included_scopes"]]
                except json.JSONDecodeError:
                    pass

            if included_scopes is not None:
                before = len(projects)
                projects = [p for p in projects if str(p.get("id")) in included_scopes]
                logger.info("Filtered Jira projects by included_scopes: %d -> %d", before, len(projects))
                if not projects:
                    await runner.log_status("No matching projects after scope filter")
                    await runner.complete()
                    return

            logger.info("Found %d Jira projects", len(projects))

            # 4. Per-project scan
            all_sprints: list[dict] = []
            total_issues = 0
            ai_client = await get_ai_client(runner.org_id, db, task="default")

            for project in projects:
                key = project.get("key", "")
                name = project.get("name", "")

                try:
                    # Fetch recent issues via the enhanced search endpoint
                    # (Atlassian retired GET /rest/api/3/search — 410 Gone).
                    issues_resp = await _jira_post(
                        client,
                        f"{jira_base}/rest/api/3/search/jql",
                        headers,
                        {
                            "jql": f"project={key} ORDER BY updated DESC",
                            "maxResults": 200,
                            "fields": ["summary", "status", "assignee", "priority", "updated", "issuetype"],
                        },
                    )
                    issues = issues_resp.get("issues", []) if isinstance(issues_resp, dict) else []
                    total_issues += len(issues)

                    # Fetch boards for this project
                    project_sprints: list[dict] = []
                    boards_resp = await _jira_get(
                        client,
                        f"{jira_base}/rest/agile/1.0/board?projectKeyOrId={key}",
                        headers,
                    )
                    if boards_resp and isinstance(boards_resp, dict):
                        boards = boards_resp.get("values", [])
                        for board in boards:
                            board_id = board.get("id")
                            if not board_id:
                                continue
                            sprints_resp = await _jira_get(
                                client,
                                f"{jira_base}/rest/agile/1.0/board/{board_id}/sprint?state=active,future",
                                headers,
                            )
                            if sprints_resp and isinstance(sprints_resp, dict):
                                board_sprints = sprints_resp.get("values", [])
                                project_sprints.extend(board_sprints)
                                all_sprints.extend(board_sprints)

                    # AI analysis for this project
                    prompt = _build_project_prompt(project, issues, project_sprints)
                    entry_path = f"services/jira-{key.lower()}"
                    title = f"Jira — {key}: {name}"

                    analysis, tokens_used = await ai_client.chat_with_usage(
                        system=system_prompt("Jira", role="senior delivery manager"),
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=1500,
                    )

                    entry, action = await runner.upsert_entry(
                        path=entry_path,
                        title=title,
                        content=analysis,
                        category="services",
                        source_ref=f"jira:project:{key}",
                    )

                    await runner.record_item(
                        resource_path=f"jira/{key}",
                        action=action,
                        ai_model=ai_client.model,
                        tokens_used=tokens_used,
                        directory_entry_id=entry.id,
                    )
                    logger.info("Wrote entry %s for Jira project %s", entry_path, key)

                except Exception:
                    logger.exception("Failed to scan Jira project %s", key)
                    await runner.record_item(
                        resource_path=f"jira/{key}",
                        action="failed",
                        reason="project scan error",
                    )

            # 5. Overall delivery health summary
            try:
                health_prompt = _build_health_prompt(projects, all_sprints, total_issues)

                health_analysis, health_tokens = await ai_client.chat_with_usage(
                    system=system_prompt("Jira", role="senior delivery manager analysing cross-project data"),
                    messages=[{"role": "user", "content": health_prompt}],
                    max_tokens=1500,
                )

                health_entry, health_action = await runner.upsert_entry(
                    path="overview/jira-delivery-health",
                    title="Jira — Delivery Health Overview",
                    content=health_analysis,
                    category="overview",
                    source_ref=f"jira:cloud:{cloud_id}",
                )

                await runner.record_item(
                    resource_path="jira/delivery-health",
                    action=health_action,
                    ai_model=ai_client.model,
                    tokens_used=health_tokens,
                    directory_entry_id=health_entry.id,
                )
                logger.info("Wrote overall Jira delivery health entry")

            except Exception:
                logger.exception("AI analysis failed for Jira delivery health")
                await runner.record_item(
                    resource_path="jira/delivery-health",
                    action="failed",
                    reason="AI analysis error",
                )

        await runner.complete()

    except Exception as exc:
        logger.exception("Jira scan failed")
        await runner.fail(str(exc))
