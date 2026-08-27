"""GitHub scan connector — fetches repo files and runs per-category AI analysis.

Scans GitHub repos via GitHub App installation tokens, fetches key config files
per repo, runs per-category AI analysis via Sonnet, and writes DirectoryEntry
records into the team directory.
"""

import base64
import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ...services.ai_provider import get_ai_client
from ...services.github_app import get_installation_token
from ...services.secret_filter import redact_secrets, should_skip_file
from .prompting import system_prompt
from .scan_runner import ScanRunner, with_retry

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# Files to fetch from the repo root (or key paths).
_KEY_FILES = [
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.js",
    "vite.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Gemfile",
    "pom.xml",
    "Cargo.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Jenkinsfile",
    "README.md",
]

# ---------------------------------------------------------------------------
# Category prompt templates
# ---------------------------------------------------------------------------

CATEGORY_PROMPTS = {
    "frontend": (
        "Analyze this repository's frontend stack. Cover: frameworks, UI libraries, "
        "state management, styling approach, component patterns, build tooling. "
        "Write a concise markdown summary (200-400 words)."
    ),
    "backend": (
        "Analyze this repository's backend stack. Cover: language, framework, API patterns, "
        "database layer, ORM, auth approach, background jobs. "
        "Write a concise markdown summary (200-400 words)."
    ),
    "infrastructure": (
        "Analyze this repository's infrastructure and CI/CD. Cover: containerisation, "
        "deployment strategy, hosting platform, CI/CD pipelines, environments, IaC. "
        "Write a concise markdown summary (200-400 words)."
    ),
    "security": (
        "Analyze this repository's security posture. Cover: authentication strategy, "
        "secrets handling, dependency vulnerability risk, input validation patterns. "
        "Write a concise markdown summary (200-400 words)."
    ),
    "services": (
        "Analyze this repository's module/service architecture. Cover: major modules, "
        "their boundaries, communication patterns, API surface. "
        "Write a concise markdown summary (200-400 words)."
    ),
    "overview": (
        "Write a concise overview of this repository (150-250 words). What does it do, "
        "how is it built, what are the key technologies? This is for a team directory — "
        "write it so a new team member can quickly understand the project."
    ),
}

# ---------------------------------------------------------------------------
# File categorisation rules
# ---------------------------------------------------------------------------

_FRONTEND_PATTERNS = {
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.js",
    "vite.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
}

_BACKEND_PATTERNS = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Gemfile",
    "pom.xml",
    "Cargo.toml",
}

_INFRA_PATTERNS = {
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Jenkinsfile",
}

_SECURITY_PATTERNS = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
}


def _categorize_files(files: dict[str, str], language: str) -> dict[str, dict[str, str]]:
    """Sort fetched files into analysis categories based on filename patterns.

    Args:
        files: Mapping of filename -> file content.
        language: Primary repo language reported by GitHub.

    Returns:
        Dict of ``{category: {filename: content}}``.
    """
    categories: dict[str, dict[str, str]] = {}

    for fname, content in files.items():
        basename = fname.rsplit("/", 1)[-1]

        # Infrastructure includes workflow files
        if basename in _INFRA_PATTERNS or fname.startswith(".github/workflows/"):
            categories.setdefault("infrastructure", {})[fname] = content

        if basename in _FRONTEND_PATTERNS:
            categories.setdefault("frontend", {})[fname] = content

        if basename in _BACKEND_PATTERNS:
            categories.setdefault("backend", {})[fname] = content

        if basename in _SECURITY_PATTERNS:
            categories.setdefault("security", {})[fname] = content

        # Services + overview get folder structure and README
        if basename == "README.md" or fname == "_folder_structure":
            categories.setdefault("services", {})[fname] = content
            categories.setdefault("overview", {})[fname] = content

    return categories


def _build_category_prompt(
    category: str,
    files: dict[str, str],
    repo_name: str,
    language: str,
    readme: str | None = None,
    package_manifest: str | None = None,
) -> str:
    """Build an AI analysis prompt for a category, including file contents.

    README (if present) is placed first as the primary signal about repo intent,
    followed by the package manifest (package.json / pyproject.toml / etc.) if
    present, then category-specific files.
    """
    instruction = CATEGORY_PROMPTS.get(category, CATEGORY_PROMPTS["overview"])

    parts = [
        f"Repository: {repo_name}",
        f"Primary language: {language}",
        "",
        instruction,
        "",
    ]

    if readme:
        readme_truncated = readme[:10000]
        if len(readme) > 10000:
            readme_truncated += "\n... (truncated)"
        parts.append("--- README ---")
        parts.append(readme_truncated)
        parts.append("")

    if package_manifest:
        pm_truncated = package_manifest[:5000]
        if len(package_manifest) > 5000:
            pm_truncated += "\n... (truncated)"
        parts.append("--- Package manifest (dependencies, scripts) ---")
        parts.append(f"```\n{pm_truncated}\n```")
        parts.append("")

    if files:
        parts.append("--- Category-specific files ---")
        for fname, content in files.items():
            truncated = content[:8000]
            if len(content) > 8000:
                truncated += "\n... (truncated)"
            parts.append(f"\n### {fname}\n```\n{truncated}\n```")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# GitHub API helpers
# ---------------------------------------------------------------------------


@with_retry
async def _fetch_file(client: httpx.AsyncClient, owner_repo: str, path: str, headers: dict) -> str | None:
    """Fetch a single file from the GitHub Contents API.

    Handles both file content (base64-decoded) and directory listings (returned
    as a JSON string of entry names).

    Returns None if the file is not found or should be skipped.
    """
    resp = await client.get(f"{GITHUB_API}/repos/{owner_repo}/contents/{path}", headers=headers)

    if resp.status_code == 404:
        return None
    resp.raise_for_status()

    data = resp.json()

    # Directory listing
    if isinstance(data, list):
        names = [entry.get("name", "") for entry in data]
        return json.dumps(names, indent=2)

    # Single file
    if data.get("type") != "file":
        return None

    filename = data.get("name", path)
    if should_skip_file(filename):
        logger.debug("Skipping secret file: %s", path)
        return None

    raw = base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
    return redact_secrets(raw)


@with_retry
async def _fetch_workflows(client: httpx.AsyncClient, owner_repo: str, headers: dict) -> dict[str, str]:
    """Fetch all .yml/.yaml workflow files from ``.github/workflows/``.

    Returns a dict of ``{path: content}``.
    """
    resp = await client.get(f"{GITHUB_API}/repos/{owner_repo}/contents/.github/workflows", headers=headers)

    if resp.status_code == 404:
        return {}
    resp.raise_for_status()

    entries = resp.json()
    if not isinstance(entries, list):
        return {}

    workflows: dict[str, str] = {}
    for entry in entries:
        name = entry.get("name", "")
        if not (name.endswith(".yml") or name.endswith(".yaml")):
            continue
        path = entry.get("path", f".github/workflows/{name}")
        content = await _fetch_file(client, owner_repo, path, headers)
        if content is not None:
            workflows[path] = content

    return workflows


async def _build_folder_structure(client: httpx.AsyncClient, owner_repo: str, headers: dict) -> str | None:
    """Fetch the root directory listing and format as a folder structure string."""
    content = await _fetch_file(client, owner_repo, "", headers)
    if content is None:
        return None
    return content


# ---------------------------------------------------------------------------
# Per-repo scan
# ---------------------------------------------------------------------------


async def _scan_repo(
    runner: ScanRunner,
    db: AsyncSession,
    client: httpx.AsyncClient,
    repo: dict,
    headers: dict,
) -> None:
    """Scan a single repo: fetch files, categorize, run AI analysis, write entries."""
    full_name = repo.get("full_name", "")
    repo_slug = full_name.rsplit("/", 1)[-1] if "/" in full_name else full_name
    language = repo.get("language") or "Unknown"

    logger.info("Scanning repo %s", full_name)

    # 1. Fetch key files
    fetched_files: dict[str, str] = {}

    for path in _KEY_FILES:
        content = await _fetch_file(client, full_name, path, headers)
        if content is not None:
            fetched_files[path] = content

    # 2. Fetch workflow files
    workflows = await _fetch_workflows(client, full_name, headers)
    fetched_files.update(workflows)

    # 3. Fetch folder structure for services/overview
    folder_structure = await _build_folder_structure(client, full_name, headers)
    if folder_structure is not None:
        fetched_files["_folder_structure"] = folder_structure

    if not fetched_files:
        logger.warning("No files fetched for repo %s, skipping", full_name)
        await runner.record_item(resource_path=full_name, action="skipped", reason="no files found")
        return

    # 4. Categorize files
    categories = _categorize_files(fetched_files, language)

    if not categories:
        logger.warning("No categories matched for repo %s, skipping", full_name)
        await runner.record_item(resource_path=full_name, action="skipped", reason="no categories matched")
        return

    await runner.log_status(
        f"Fetched {len(fetched_files)} files from {repo_slug} — "
        f"analyzing {', '.join(categories.keys())}"
    )

    # 5. Run AI analysis per category
    ai_client = await get_ai_client(runner.org_id, db, task="default")

    # Pull README and primary package manifest out of fetched_files so we can
    # prioritise them in every per-category prompt.
    readme = fetched_files.get("README.md")
    package_manifest = (
        fetched_files.get("package.json")
        or fetched_files.get("pyproject.toml")
        or fetched_files.get("requirements.txt")
        or fetched_files.get("Cargo.toml")
        or fetched_files.get("go.mod")
    )

    for category, cat_files in categories.items():
        await runner.log_status(f"Analyzing {repo_slug}/{category}...")
        prompt = _build_category_prompt(
            category, cat_files, repo_slug, language,
            readme=readme, package_manifest=package_manifest,
        )
        entry_path = f"{category}/{repo_slug}"
        title = f"{repo_slug} — {category}"

        try:
            analysis, tokens_used = await ai_client.chat_with_usage(
                system=system_prompt("GitHub", role="senior software architect"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1500,
            )

            entry, entry_action = await runner.upsert_entry(
                path=entry_path,
                title=title,
                content=analysis,
                category=category,
                source_ref=f"https://github.com/{full_name}",
            )

            await runner.record_item(
                resource_path=f"{full_name}/{category}",
                action=entry_action,
                ai_model=ai_client.model,
                tokens_used=tokens_used,
                directory_entry_id=entry.id,
            )
            logger.info("Wrote entry %s for repo %s", entry_path, full_name)

        except Exception:
            logger.exception("AI analysis failed for %s/%s", full_name, category)
            await runner.record_item(
                resource_path=f"{full_name}/{category}",
                action="failed",
                reason="AI analysis error",
            )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point: authenticate, list repos, scan each one.

    Args:
        runner: Pre-configured ScanRunner instance.
        db: Active database session.
    """
    await runner.start(scan_type="full")
    await runner.log_status("Starting GitHub scan...")

    try:
        # 1. Get installation ID from the integration record
        result = await db.execute(select(OrgIntegration).where(OrgIntegration.id == runner.integration_id))
        integration = result.scalar_one_or_none()

        if not integration:
            await runner.fail("Integration not found")
            return

        # The installation ID is stored in the credentials or metadata field
        metadata = json.loads(integration.metadata_json or "{}")
        installation_id = metadata.get("installation_id") or metadata.get("installationId")

        if not installation_id:
            await runner.fail("No GitHub installation ID configured")
            return

        await runner.log_status("Authenticating with GitHub App...")

        # 2. Get installation token
        token_data = await get_installation_token(str(installation_id))
        token = token_data["token"]

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        await runner.log_status("Listing accessible repositories...")

        # 3. List repos (sorted by pushed_at desc)
        async with httpx.AsyncClient(timeout=30) as client:
            repos: list[dict] = []
            page = 1
            while True:
                resp = await client.get(
                    f"{GITHUB_API}/installation/repositories",
                    params={"per_page": 100, "page": page, "sort": "pushed", "direction": "desc"},
                    headers=headers,
                )
                if resp.status_code != 200:
                    logger.error("Failed to list repos: %s %s", resp.status_code, resp.text[:200])
                    await runner.fail(f"Failed to list repos: HTTP {resp.status_code}")
                    return

                data = resp.json()
                repos.extend(data.get("repositories", []))
                if len(data.get("repositories", [])) < 100:
                    break
                page += 1

            await runner.log_status(f"Found {len(repos)} {'repo' if len(repos) == 1 else 'repos'} to scan")

            # 4. Scan each repo
            for i, repo in enumerate(repos, 1):
                repo_name = repo.get("full_name", "unknown")
                await runner.log_status(f"Scanning {repo_name} ({i}/{len(repos)})...")
                try:
                    await _scan_repo(runner, db, client, repo, headers)
                except Exception:
                    logger.exception("Failed to scan repo %s", repo_name)
                    await runner.record_item(
                        resource_path=repo_name,
                        action="failed",
                        reason="repo scan error",
                    )
                    await runner.log_status(f"Failed to scan {repo_name}")

        await runner.log_status("Scan complete")
        await runner.complete()

    except Exception as exc:
        logger.exception("GitHub scan failed")
        await runner.fail(str(exc))
