"""Confluence scan connector — fetches spaces and pages via Atlassian REST API.

Scans Confluence Cloud via the same OAuth 2.0 token as Jira, fetches global
spaces with their recent pages, strips HTML to plain text, filters secrets,
runs per-space AI analysis, and writes DirectoryEntry records for each space.
"""

import json
import logging
import re

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ...services.ai_provider import get_ai_client
from ...services.crypto import decrypt_api_key
from ...services.secret_filter import redact_secrets
from .prompting import system_prompt
from .scan_runner import ScanRunner, with_retry

logger = logging.getLogger(__name__)

ATLASSIAN_API = "https://api.atlassian.com"

# Maximum page body size in bytes before skipping
_MAX_PAGE_SIZE = 50 * 1024  # 50 KB

# ---------------------------------------------------------------------------
# HTML stripping
# ---------------------------------------------------------------------------


def _strip_html(html: str | None) -> str:
    """Strip HTML tags from content, returning plain text.

    Handles None and empty input gracefully.

    Args:
        html: Raw HTML string or None.

    Returns:
        Plain text with HTML tags removed and whitespace normalized.
    """
    if not html:
        return ""

    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


# Categories the page classifier can return. Keep in sync with the directory
# page's CATEGORIES list — anything else falls back to "documentation".
_PAGE_CATEGORIES: tuple[str, ...] = (
    "architecture",
    "frontend",
    "backend",
    "infrastructure",
    "security",
    "services",
    "documentation",
)


def _slugify(text: str) -> str:
    """Make a path-safe slug from a page title."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:80] or "untitled"


def _build_page_classifier_prompt(space_name: str, pages: list[dict]) -> str:
    """Prompt the AI to classify and describe each page in one shot.

    Expects the AI to return a JSON array where each item is
    ``{"id": "...", "category": "...", "description": "..."}``.
    """
    parts = [
        f"Confluence space: {space_name}",
        "",
        "For EACH page below, output ONE JSON object with:",
        "  - id: the page id verbatim",
        f"  - category: one of {list(_PAGE_CATEGORIES)} — pick the best fit",
        "  - description: 1-2 sentence plain-language summary (no marketing fluff)",
        "",
        "Return ONLY a JSON array, no commentary, no code fences.",
        "",
        "--- Pages ---",
    ]
    for p in pages:
        pid = p.get("id", "")
        title = p.get("title", "Untitled")
        content = (p.get("content") or "")[:4000]
        parts.append(f"\n[id: {pid}]\n## {title}\n{content}")
    return "\n".join(parts)


def _parse_classifier_output(raw: str) -> dict[str, dict]:
    """Parse the classifier JSON and return a mapping page_id -> {category, description}."""
    text = raw.strip()
    # Strip markdown code fences if the model added them despite instructions
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Page classifier output was not valid JSON")
        return {}

    if not isinstance(parsed, list):
        return {}

    out: dict[str, dict] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        pid = str(item.get("id") or "").strip()
        if not pid:
            continue
        category = str(item.get("category") or "documentation").strip().lower()
        if category not in _PAGE_CATEGORIES:
            category = "documentation"
        description = str(item.get("description") or "").strip()
        out[pid] = {"category": category, "description": description}
    return out


def _build_space_prompt(space_name: str, pages: list[dict]) -> str:
    """Build an AI prompt for a Confluence space.

    Includes space name and page titles with truncated content (up to 20 pages,
    2000 chars each).

    Args:
        space_name: Name of the Confluence space.
        pages: List of dicts with 'title' and 'content' keys.

    Returns:
        Complete prompt string for AI analysis.
    """
    parts = [
        f"Confluence Space: {space_name}",
        f"Pages: {len(pages)}",
        "",
        "--- Pages ---",
    ]

    for page in pages[:40]:
        title = page.get("title", "Untitled")
        content = page.get("content", "")
        truncated = content[:6000]
        if len(content) > 6000:
            truncated += "\n... (truncated)"
        parts.append(f"\n### {title}\n{truncated}")

    parts.append("")
    parts.append(
        "Analyze this Confluence space's documentation. Cover: topics covered, documentation "
        "quality, gaps or missing areas, key decisions or architecture notes, onboarding value. "
        "Write a concise markdown summary (200-400 words)."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Confluence API helpers
# ---------------------------------------------------------------------------


@with_retry
async def _confluence_get(client: httpx.AsyncClient, url: str, headers: dict) -> dict | list | None:
    """Make an authenticated GET request to the Confluence/Atlassian API.

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


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point: authenticate via OAuth, list spaces, scan pages.

    Uses the same OAuth token as the Jira connector. Resolves the Atlassian
    cloud site ID, lists global Confluence spaces, fetches pages per space
    (sorted by modified date), strips HTML, filters secrets, runs AI analysis,
    and writes directory entries.

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
            await runner.fail("No Confluence OAuth token configured")
            return

        token = decrypt_api_key(integration.access_token)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # 2. Get cloud site ID via accessible-resources
            resources = await _confluence_get(
                client, f"{ATLASSIAN_API}/oauth/token/accessible-resources", headers
            )
            if not resources or not isinstance(resources, list) or len(resources) == 0:
                await runner.fail("No accessible Confluence sites found")
                return

            cloud_id = resources[0]["id"]
            confluence_base = f"{ATLASSIAN_API}/ex/confluence/{cloud_id}"
            logger.info("Confluence cloud site resolved: %s", cloud_id)

            # 3. List spaces (up to 25) — include all types (global, personal, collaboration)
            spaces_resp = await _confluence_get(
                client, f"{confluence_base}/wiki/api/v2/spaces?limit=25", headers
            )
            if not spaces_resp or not isinstance(spaces_resp, dict):
                await runner.fail("Failed to list Confluence spaces")
                return

            spaces = spaces_resp.get("results", [])
            if not spaces:
                logger.warning("No Confluence spaces found")
                await runner.complete()
                return

            # Filter to the spaces the user opted in to, if any are set.
            included_scopes: list[str] | None = None
            if integration.metadata_json:
                try:
                    meta = json.loads(integration.metadata_json)
                    if isinstance(meta.get("included_scopes"), list):
                        included_scopes = [str(s) for s in meta["included_scopes"]]
                except json.JSONDecodeError:
                    pass

            if included_scopes is not None:
                before = len(spaces)
                spaces = [s for s in spaces if str(s.get("id")) in included_scopes]
                logger.info(
                    "Filtered Confluence spaces by included_scopes: %d -> %d", before, len(spaces)
                )
                if not spaces:
                    await runner.log_status("No matching spaces after scope filter")
                    await runner.complete()
                    return

            logger.info("Scanning %d Confluence spaces", len(spaces))

            # 4. Per-space scan
            ai_client = await get_ai_client(runner.org_id, db, task="default")

            for space in spaces:
                space_id = space.get("id")
                space_key = space.get("key", "")
                space_name = space.get("name", space_key)

                try:
                    # Fetch pages for this space (up to 50, sorted by modified desc)
                    pages_resp = await _confluence_get(
                        client,
                        f"{confluence_base}/wiki/api/v2/spaces/{space_id}/pages?limit=50&sort=-modified-date",
                        headers,
                    )
                    raw_pages = pages_resp.get("results", []) if isinstance(pages_resp, dict) else []

                    # Fetch page content for each page
                    pages_with_content: list[dict] = []
                    for page in raw_pages:
                        page_id = page.get("id")
                        page_title = page.get("title", "Untitled")

                        try:
                            page_detail = await _confluence_get(
                                client,
                                f"{confluence_base}/wiki/api/v2/pages/{page_id}?body-format=storage",
                                headers,
                            )
                            if not page_detail or not isinstance(page_detail, dict):
                                continue

                            # Extract HTML body
                            body = page_detail.get("body", {})
                            storage = body.get("storage", {})
                            html_content = storage.get("value", "")

                            # Skip oversized pages
                            if len(html_content.encode("utf-8", errors="replace")) > _MAX_PAGE_SIZE:
                                logger.debug("Skipping oversized page %s (%s)", page_title, page_id)
                                continue

                            # Strip HTML and filter secrets
                            plain_text = _strip_html(html_content)
                            filtered_text = redact_secrets(plain_text)

                            if plain_text:
                                pages_with_content.append({
                                    "id": str(page_id),
                                    "title": page_title,
                                    "content": filtered_text,
                                })

                        except Exception:
                            logger.exception("Failed to fetch page %s (%s)", page_title, page_id)
                            continue

                    if not pages_with_content:
                        logger.warning("No page content fetched for space %s, skipping", space_key)
                        await runner.record_item(
                            resource_path=f"confluence/{space_key}",
                            action="skipped",
                            reason="no page content",
                        )
                        continue

                    # Build site link for readable source_refs
                    site_url = resources[0].get("url", "")

                    # 1. Space-level overview entry (existing behaviour)
                    space_path = f"documentation/{space_key.lower()}"
                    space_title = f"Confluence — {space_name}"
                    space_prompt = _build_space_prompt(space_name, pages_with_content)
                    analysis, tokens_used = await ai_client.chat_with_usage(
                        system=system_prompt("Confluence", role="senior technical writer"),
                        messages=[{"role": "user", "content": space_prompt}],
                        max_tokens=1500,
                    )
                    space_entry, space_action = await runner.upsert_entry(
                        path=space_path,
                        title=space_title,
                        content=analysis,
                        category="documentation",
                        source_ref=f"confluence:space:{space_key}",
                    )
                    await runner.record_item(
                        resource_path=f"confluence/{space_key}",
                        action=space_action,
                        ai_model=ai_client.model,
                        tokens_used=tokens_used,
                        directory_entry_id=space_entry.id,
                    )
                    logger.info("Wrote space overview %s", space_path)

                    # 2. Per-page classifier — one batched AI call returns category +
                    # description for every page at once.
                    classifier_prompt = _build_page_classifier_prompt(space_name, pages_with_content)
                    classifier_raw, classifier_tokens = await ai_client.chat_with_usage(
                        system=(
                            "You are a technical documentation librarian. Classify and summarise "
                            "pages into JSON as instructed. Never include commentary outside the JSON."
                        ),
                        messages=[{"role": "user", "content": classifier_prompt}],
                        max_tokens=2048,
                    )
                    classified = _parse_classifier_output(classifier_raw)

                    # Record tokens from the classifier batch call as a single item
                    await runner.record_item(
                        resource_path=f"confluence/{space_key}/_classifier",
                        action="scanned",
                        ai_model=ai_client.model,
                        tokens_used=classifier_tokens,
                    )

                    # 3. Create a DirectoryEntry per page
                    for page in pages_with_content:
                        pid = page["id"]
                        page_title_text = page["title"]
                        meta = classified.get(pid, {})
                        page_category = meta.get("category", "documentation")
                        description = meta.get("description", "")

                        slug = _slugify(page_title_text)
                        page_path = f"{space_path}/{slug}"

                        # Compose content: description up top, then the full page text.
                        body_parts = []
                        if description:
                            body_parts.append(f"**{description}**")
                            body_parts.append("")
                        body_parts.append(page["content"])
                        page_body = "\n".join(body_parts)

                        page_source_ref = (
                            f"{site_url}/wiki/spaces/{space_key}/pages/{pid}" if site_url else f"confluence:page:{pid}"
                        )

                        try:
                            entry, action = await runner.upsert_entry(
                                path=page_path,
                                title=page_title_text,
                                content=page_body,
                                category=page_category,
                                source_ref=page_source_ref,
                            )
                            # Parent the page under the space overview
                            if entry.parent_id != space_entry.id:
                                entry.parent_id = space_entry.id

                            await runner.record_item(
                                resource_path=f"confluence/{space_key}/{slug}",
                                action=action,
                                directory_entry_id=entry.id,
                            )
                        except Exception:
                            logger.exception("Failed to upsert page entry %s", page_path)
                            await runner.record_item(
                                resource_path=f"confluence/{space_key}/{slug}",
                                action="failed",
                                reason="page upsert error",
                            )

                except Exception:
                    logger.exception("Failed to scan Confluence space %s", space_key)
                    await runner.record_item(
                        resource_path=f"confluence/{space_key}",
                        action="failed",
                        reason="space scan error",
                    )

        await runner.complete()

    except Exception as exc:
        logger.exception("Confluence scan failed")
        await runner.fail(str(exc))
