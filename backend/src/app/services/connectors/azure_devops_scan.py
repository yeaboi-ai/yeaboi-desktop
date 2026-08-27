"""Azure DevOps scan connector.

Scans an Azure DevOps organization via either an OAuth token (Microsoft Entra)
or a Personal Access Token. Fetches repositories, recent pipelines, and wiki
pages, classifies each with AI, and writes DirectoryEntry records.
"""

from __future__ import annotations

import base64
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

_API_VERSION = "api-version=7.1"
_MAX_WIKI_PAGE_BYTES = 50 * 1024  # 50 KB

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
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:80] or "untitled"


def _auth_context(integration: OrgIntegration) -> tuple[str, str] | None:
    """Return (auth_header_value, org_slug) for the configured integration, or None.

    Supports two auth modes:
      - credential: PAT + organization stored in integration.credentials
      - oauth: Microsoft Entra access token stored in integration.access_token

    OAuth tokens go in Authorization: Bearer. PATs are Basic base64(:pat).
    """
    if integration.auth_type == "credential" and integration.credentials:
        raw = decrypt_api_key(integration.credentials)
        try:
            creds = json.loads(raw)
        except json.JSONDecodeError:
            return None
        org = (creds.get("organization") or "").strip()
        pat = (creds.get("personal_access_token") or "").strip()
        if not org or not pat:
            return None
        token = base64.b64encode(f":{pat}".encode()).decode()
        return f"Basic {token}", org

    if integration.auth_type == "oauth" and integration.access_token:
        token = decrypt_api_key(integration.access_token)
        org = ""
        if integration.metadata_json:
            try:
                meta = json.loads(integration.metadata_json)
                org = (meta.get("organization") or "").strip()
            except json.JSONDecodeError:
                pass
        if not org:
            return None
        return f"Bearer {token}", org

    return None


@with_retry
async def _ado_get(client: httpx.AsyncClient, url: str, headers: dict) -> dict | list | None:
    resp = await client.get(url, headers=headers)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


async def _ado_get_text(client: httpx.AsyncClient, url: str, headers: dict) -> str | None:
    """GET the raw text body of a URL (e.g. a file blob from the repo)."""
    try:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.text
    except Exception:
        return None


async def _fetch_repo_file(
    client: httpx.AsyncClient, base: str, project_name: str, repo_id: str, path: str, headers: dict
) -> str | None:
    """Fetch a single file from the default branch of an ADO repo."""
    url = (
        f"{base}/{project_name}/_apis/git/repositories/{repo_id}/items"
        f"?path={path}&includeContent=true&{_API_VERSION}"
    )
    text = await _ado_get_text(client, url, headers)
    if text is None:
        return None
    # When the file is text, ADO returns the raw content. Binary files return
    # JSON metadata — skip those.
    if text.lstrip().startswith("{\"objectId"):
        return None
    return text


def _build_repo_prompt(
    repo_name: str,
    default_branch: str,
    commit_sample: list[dict],
    readme: str | None = None,
    manifest: str | None = None,
    manifest_name: str | None = None,
) -> str:
    parts = [
        f"Azure DevOps repository: {repo_name}",
        f"Default branch: {default_branch or 'unknown'}",
        "",
    ]
    if readme:
        readme_truncated = readme[:10000]
        if len(readme) > 10000:
            readme_truncated += "\n... (truncated)"
        parts.append("--- README ---")
        parts.append(readme_truncated)
        parts.append("")
    if manifest:
        m_truncated = manifest[:5000]
        if len(manifest) > 5000:
            m_truncated += "\n... (truncated)"
        parts.append(f"--- {manifest_name or 'Manifest'} ---")
        parts.append(f"```\n{m_truncated}\n```")
        parts.append("")
    parts.append("--- Recent commit subjects (up to 100, most-recent first) ---")
    for c in commit_sample[:100]:
        comment = c.get("comment", "") or ""
        author = (c.get("author", {}) or {}).get("name", "")
        first_line = comment.splitlines()[0][:120] if comment else ""
        parts.append(f"- {first_line}" + (f"  _({author})_" if author else ""))
    parts.append("")
    parts.append(
        "Summarise what this repo is, its tech stack (inferred from README + "
        "manifest + commit signal), who contributes, and activity patterns. "
        "Be honest when the signal is thin."
    )
    return "\n".join(parts)


def _build_pipelines_prompt(project_name: str, pipelines: list[dict], recent_runs: dict[int, list[dict]]) -> str:
    """AI prompt that summarises pipelines with recent-run context."""
    parts = [
        f"Azure DevOps project: {project_name}",
        f"Pipelines: {len(pipelines)}",
        "",
        "--- Pipelines + recent runs ---",
    ]
    for p in pipelines[:40]:
        pname = p.get("name", "")
        pid = p.get("id")
        runs = recent_runs.get(pid, [])
        parts.append(f"\n### {pname}")
        if not runs:
            parts.append("_no recent runs_")
            continue
        for r in runs[:5]:
            state = r.get("state", "?")
            result = r.get("result", "?")
            finished = r.get("finishedDate", "")[:19] or "?"
            parts.append(f"- {state}/{result} at {finished}")
    parts.append("")
    parts.append(
        "Summarise the CI/CD posture: what's being built, pass/fail patterns, "
        "frequently failing pipelines, stale pipelines (no recent runs), and any "
        "obvious gaps (no tests, no deployment automation, etc.)."
    )
    return "\n".join(parts)


def _build_wiki_page_classifier_prompt(wiki_name: str, pages: list[dict]) -> str:
    parts = [
        f"Azure DevOps wiki: {wiki_name}",
        "",
        "For EACH page below, output ONE JSON object with:",
        "  - id: the page id verbatim",
        f"  - category: one of {list(_PAGE_CATEGORIES)}",
        "  - description: 1-2 sentence plain-language summary",
        "",
        "Return ONLY a JSON array, no commentary, no code fences.",
        "",
        "--- Pages ---",
    ]
    for p in pages:
        parts.append(f"\n[id: {p.get('id', '')}]\n## {p.get('title', 'Untitled')}\n{(p.get('content') or '')[:4000]}")
    return "\n".join(parts)


def _parse_classifier_output(raw: str) -> dict[str, dict]:
    text = raw.strip()
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
        out[pid] = {
            "category": category,
            "description": str(item.get("description") or "").strip(),
        }
    return out


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point."""
    await runner.start(scan_type="full")

    try:
        result = await db.execute(select(OrgIntegration).where(OrgIntegration.id == runner.integration_id))
        integration = result.scalar_one_or_none()
        if not integration:
            await runner.fail("Integration not found")
            return

        ctx = _auth_context(integration)
        if not ctx:
            await runner.fail("Azure DevOps auth not configured — reconnect the integration")
            return
        auth_header, org_slug = ctx
        headers = {"Authorization": auth_header, "Accept": "application/json"}

        base = f"https://dev.azure.com/{org_slug}"
        await runner.log_status(f"Connected to organisation {org_slug}")

        # Optional scope restriction via metadata.included_scopes (project ids)
        included_scopes: list[str] | None = None
        if integration.metadata_json:
            try:
                meta = json.loads(integration.metadata_json)
                if isinstance(meta.get("included_scopes"), list):
                    included_scopes = [str(s) for s in meta["included_scopes"]]
            except json.JSONDecodeError:
                pass

        async with httpx.AsyncClient(timeout=30) as client:
            # 1. List projects
            projects_resp = await _ado_get(client, f"{base}/_apis/projects?{_API_VERSION}", headers)
            projects = (projects_resp or {}).get("value", []) if isinstance(projects_resp, dict) else []
            if included_scopes is not None:
                before = len(projects)
                projects = [p for p in projects if str(p.get("id")) in included_scopes]
                logger.info("Filtered ADO projects by included_scopes: %d -> %d", before, len(projects))
            if not projects:
                await runner.log_status("No projects in scope — nothing to scan")
                await runner.complete()
                return

            ai_client = await get_ai_client(runner.org_id, db, task="default")

            for project in projects:
                project_name = project.get("name", "")
                await runner.log_status(f"Scanning project {project_name}")

                # 2. Repos in this project
                try:
                    repos_resp = await _ado_get(
                        client,
                        f"{base}/{project_name}/_apis/git/repositories?{_API_VERSION}",
                        headers,
                    )
                    repos = (repos_resp or {}).get("value", []) if isinstance(repos_resp, dict) else []
                except Exception:
                    logger.exception("Failed to list repos for %s", project_name)
                    repos = []

                for repo in repos:
                    repo_name = repo.get("name", "")
                    repo_id = repo.get("id", "")
                    try:
                        commits_resp = await _ado_get(
                            client,
                            f"{base}/{project_name}/_apis/git/repositories/{repo_id}/commits?searchCriteria.$top=100&{_API_VERSION}",
                            headers,
                        )
                        commits = (commits_resp or {}).get("value", []) if isinstance(commits_resp, dict) else []
                    except Exception:
                        commits = []

                    # Fetch README (try a few common variants)
                    readme: str | None = None
                    for candidate in ("/README.md", "/readme.md", "/README"):
                        readme = await _fetch_repo_file(client, base, project_name, repo_id, candidate, headers)
                        if readme:
                            readme = redact_secrets(readme)
                            break

                    # Fetch the first matching package/dependency manifest
                    manifest: str | None = None
                    manifest_name: str | None = None
                    for candidate in (
                        "/package.json", "/pyproject.toml", "/requirements.txt",
                        "/Cargo.toml", "/go.mod", "/pom.xml",
                    ):
                        manifest = await _fetch_repo_file(client, base, project_name, repo_id, candidate, headers)
                        if manifest:
                            manifest = redact_secrets(manifest)
                            manifest_name = candidate.lstrip("/")
                            break

                    try:
                        prompt = _build_repo_prompt(
                            repo_name, repo.get("defaultBranch", ""), commits,
                            readme=readme, manifest=manifest, manifest_name=manifest_name,
                        )
                        analysis, tokens_used = await ai_client.chat_with_usage(
                            system=system_prompt("Azure DevOps", role="senior engineer"),
                            messages=[{"role": "user", "content": prompt}],
                            max_tokens=1200,
                        )
                        entry, action = await runner.upsert_entry(
                            path=f"services/ado-{_slugify(project_name)}-{_slugify(repo_name)}",
                            title=f"ADO — {project_name} / {repo_name}",
                            content=analysis,
                            category="services",
                            source_ref=f"{base}/{project_name}/_git/{repo_name}",
                        )
                        await runner.record_item(
                            resource_path=f"ado/{project_name}/repo/{repo_name}",
                            action=action,
                            ai_model=ai_client.model,
                            tokens_used=tokens_used,
                            directory_entry_id=entry.id,
                        )
                    except Exception:
                        logger.exception("Failed to scan repo %s", repo_name)
                        await runner.record_item(
                            resource_path=f"ado/{project_name}/repo/{repo_name}",
                            action="failed",
                            reason="repo analysis error",
                        )

                # 3. Pipelines — list + recent runs per pipeline, then AI analysis
                try:
                    pipelines_resp = await _ado_get(
                        client,
                        f"{base}/{project_name}/_apis/pipelines?{_API_VERSION}-preview.1",
                        headers,
                    )
                    pipelines = (pipelines_resp or {}).get("value", []) if isinstance(pipelines_resp, dict) else []
                    if pipelines:
                        # Fetch the last 5 runs per pipeline for activity signal
                        recent_runs: dict[int, list[dict]] = {}
                        for p in pipelines[:40]:
                            pid = p.get("id")
                            if pid is None:
                                continue
                            try:
                                runs_resp = await _ado_get(
                                    client,
                                    f"{base}/{project_name}/_apis/pipelines/{pid}/runs?{_API_VERSION}-preview.1",
                                    headers,
                                )
                                recent_runs[pid] = (runs_resp or {}).get("value", [])[:5]
                            except Exception:
                                recent_runs[pid] = []

                        await runner.record_item(
                            resource_path=f"ado/{project_name}/pipelines",
                            action="scanned",
                        )

                        pipeline_prompt = _build_pipelines_prompt(project_name, pipelines, recent_runs)
                        try:
                            pipeline_analysis, pipeline_tokens = await ai_client.chat_with_usage(
                                system=system_prompt(
                                    "Azure DevOps", role="senior release engineer analysing CI/CD pipelines"
                                ),
                                messages=[{"role": "user", "content": pipeline_prompt}],
                                max_tokens=1200,
                            )
                        except Exception:
                            logger.exception("Pipeline AI analysis failed")
                            pipeline_analysis = (
                                f"## {project_name} pipelines\n\n{len(pipelines)} pipelines discovered.\n\n"
                                + "\n".join(f"- {p.get('name','')}" for p in pipelines[:25] if p.get("name"))
                            )
                            pipeline_tokens = 0

                        entry, action = await runner.upsert_entry(
                            path=f"infrastructure/ado-{_slugify(project_name)}-pipelines",
                            title=f"ADO Pipelines — {project_name}",
                            content=pipeline_analysis,
                            category="infrastructure",
                            source_ref=f"{base}/{project_name}/_build",
                        )
                        await runner.record_item(
                            resource_path=f"ado/{project_name}/pipelines/summary",
                            action=action,
                            ai_model=ai_client.model if pipeline_tokens else None,
                            tokens_used=pipeline_tokens,
                            directory_entry_id=entry.id,
                        )
                except Exception:
                    logger.exception("Failed to list pipelines for %s", project_name)

                # 4. Wikis — list, fetch page tree, fetch content, classify + per-page entries
                try:
                    wikis_resp = await _ado_get(
                        client,
                        f"{base}/{project_name}/_apis/wiki/wikis?{_API_VERSION}",
                        headers,
                    )
                    wikis = (wikis_resp or {}).get("value", []) if isinstance(wikis_resp, dict) else []
                except Exception:
                    wikis = []

                for wiki in wikis:
                    wiki_id = wiki.get("id", "")
                    wiki_name = wiki.get("name", "Wiki")
                    try:
                        pages_root = await _ado_get(
                            client,
                            f"{base}/{project_name}/_apis/wiki/wikis/{wiki_id}/pages"
                            f"?path=/&recursionLevel=full&includeContent=true&{_API_VERSION}",
                            headers,
                        )
                    except Exception:
                        logger.exception("Failed to fetch wiki pages for %s", wiki_name)
                        continue

                    pages_flat: list[dict] = []

                    def flatten(node: dict) -> None:
                        if not isinstance(node, dict):
                            return
                        content = node.get("content") or ""
                        if content and len(content.encode("utf-8", errors="replace")) <= _MAX_WIKI_PAGE_BYTES:
                            path = node.get("path") or "/"
                            title = path.rsplit("/", 1)[-1] or "Home"
                            pages_flat.append({
                                "id": str(node.get("id") or path),
                                "title": title,
                                "path": path,
                                "content": redact_secrets(content),
                            })
                        for sub in node.get("subPages") or []:
                            flatten(sub)

                    flatten(pages_root or {})

                    if not pages_flat:
                        await runner.record_item(
                            resource_path=f"ado/{project_name}/wiki/{wiki_name}",
                            action="skipped",
                            reason="no wiki pages",
                        )
                        continue

                    # Wiki-level overview entry
                    wiki_path = f"documentation/ado-{_slugify(project_name)}-{_slugify(wiki_name)}"
                    overview_entry, overview_action = await runner.upsert_entry(
                        path=wiki_path,
                        title=f"ADO Wiki — {project_name} / {wiki_name}",
                        content=f"## {wiki_name}\n\n{len(pages_flat)} pages scanned.",
                        category="documentation",
                        source_ref=f"{base}/{project_name}/_wiki/wikis/{wiki_id}",
                    )
                    await runner.record_item(
                        resource_path=f"ado/{project_name}/wiki/{wiki_name}",
                        action=overview_action,
                        directory_entry_id=overview_entry.id,
                    )

                    # Classify all pages in one batched AI call
                    try:
                        classifier_prompt = _build_wiki_page_classifier_prompt(wiki_name, pages_flat)
                        classifier_raw, classifier_tokens = await ai_client.chat_with_usage(
                            system=(
                                "You are a technical documentation librarian. Classify and summarise "
                                "pages into JSON as instructed. Never include commentary outside the JSON."
                            ),
                            messages=[{"role": "user", "content": classifier_prompt}],
                            max_tokens=2048,
                        )
                        classified = _parse_classifier_output(classifier_raw)
                        await runner.record_item(
                            resource_path=f"ado/{project_name}/wiki/{wiki_name}/_classifier",
                            action="scanned",
                            ai_model=ai_client.model,
                            tokens_used=classifier_tokens,
                        )
                    except Exception:
                        logger.exception("Wiki classifier failed for %s", wiki_name)
                        classified = {}

                    for page in pages_flat:
                        pid = page["id"]
                        meta = classified.get(pid, {})
                        category = meta.get("category", "documentation")
                        description = meta.get("description", "")
                        slug = _slugify(page["title"])
                        body_parts = []
                        if description:
                            body_parts.append(f"**{description}**")
                            body_parts.append("")
                        body_parts.append(page["content"])
                        try:
                            entry, action = await runner.upsert_entry(
                                path=f"{wiki_path}/{slug}",
                                title=page["title"],
                                content="\n".join(body_parts),
                                category=category,
                                source_ref=f"{base}/{project_name}/_wiki/wikis/{wiki_id}?pagePath={page['path']}",
                            )
                            if entry.parent_id != overview_entry.id:
                                entry.parent_id = overview_entry.id
                            await runner.record_item(
                                resource_path=f"ado/{project_name}/wiki/{wiki_name}/{slug}",
                                action=action,
                                directory_entry_id=entry.id,
                            )
                        except Exception:
                            logger.exception("Failed to upsert wiki page %s", page["title"])
                            await runner.record_item(
                                resource_path=f"ado/{project_name}/wiki/{wiki_name}/{slug}",
                                action="failed",
                                reason="page upsert error",
                            )

        await runner.complete()

    except Exception as exc:
        logger.exception("Azure DevOps scan failed")
        await runner.fail(str(exc))
