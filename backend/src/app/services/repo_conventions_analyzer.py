"""Extract a team's ticket-writing conventions from their linked GitHub repo.

Backs the wizard's ``follow_practices`` style. Given a project with
``repo_url`` set and an active GitHub App installation in the project's org,
this:

1. Resolves the App installation token (``services/github_app.py``).
2. Fetches recent closed-merged PRs, commits on the default branch, and
   closed issues from that repo. Bounded — last 90 days, capped at 100 of
   each — so the analysis stays under a few seconds and doesn't blow the
   token budget.
3. Compacts the fetched data into a small summary (titles, sizes, label
   histogram, no diffs) and asks Claude to extract a strict-shape JSON
   profile.
4. Persists the profile on a :class:`RepoAnalysisJob` row keyed by project.

Subsequent calls within the 7-day TTL re-use the cached profile. The repo
URL is recorded on the row so a repo_url change invalidates the cache even
inside the TTL window.

All failure modes (no installation, GitHub error, AI parse error) raise
:class:`RepoAnalysisError`; the caller is expected to catch and fall back to
the ``balanced`` style with a user-visible warning.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.integration import OrgIntegration
from ..models.project import Project
from ..models.repo_analysis_job import RepoAnalysisJob
from .ai_provider import get_ai_client
from .connectors.scan_runner import with_retry
from .github_app import GITHUB_API, get_installation_token

logger = logging.getLogger(__name__)


# TTL for the cached profile. After 7 days we re-fetch; conventions don't
# shift faster than that for any team we care about.
PROFILE_TTL = timedelta(days=7)

# Bounded fetch counts — keep us under GitHub rate limits and keep the Claude
# summarisation prompt under ~6K tokens.
FETCH_PRS_MAX = 100
FETCH_COMMITS_MAX = 100
FETCH_ISSUES_MAX = 100
FETCH_WINDOW_DAYS = 90


class RepoAnalysisError(Exception):
    """Caller falls back to ``balanced`` with a user-visible warning."""


# ─── repo_url parsing ───────────────────────────────────────────────────────


_REPO_URL_RE = re.compile(r"github\.com[/:]([^/]+)/([^/.\s]+)(?:\.git)?/?$")


def parse_repo_url(repo_url: str | None) -> tuple[str, str] | None:
    """Return ``(owner, repo)`` from a GitHub URL or SSH-style remote, or ``None``.

    Accepts the common shapes the platform sees: ``https://github.com/o/r``,
    ``https://github.com/o/r.git``, ``git@github.com:o/r.git``, plain
    ``o/r``. Returns ``None`` for any other shape.
    """
    if not repo_url or not repo_url.strip():
        return None
    url = repo_url.strip()
    m = _REPO_URL_RE.search(url)
    if m:
        return m.group(1), m.group(2)
    # Plain "owner/repo" form.
    parts = url.split("/")
    if len(parts) == 2 and all(p and "." not in p for p in parts):
        return parts[0], parts[1]
    return None


# ─── installation lookup ────────────────────────────────────────────────────


async def _find_installation_id(org_id: str, db: AsyncSession) -> str | None:
    """Look up the GitHub App installation_id for an org, if one exists.

    The integration record (per ``services/connectors/github_scan.py:428``)
    stores the installation_id in its ``metadata`` JSON. We mirror that
    lookup rather than depending on the scan runner module.
    """
    integration = (
        await db.execute(
            select(OrgIntegration).where(
                OrgIntegration.org_id == org_id,
                OrgIntegration.provider == "github",
            )
        )
    ).scalar_one_or_none()
    if not integration:
        return None
    try:
        metadata = json.loads(integration.metadata_json or "{}")
    except json.JSONDecodeError:
        logger.warning("Org %s GitHub integration has malformed metadata_json", org_id)
        return None
    installation_id = metadata.get("installation_id") or metadata.get("installationId")
    return str(installation_id) if installation_id else None


# ─── GitHub fetchers ────────────────────────────────────────────────────────


def _auth_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@with_retry
async def _fetch_recent_prs(
    client: httpx.AsyncClient, owner: str, repo: str, headers: dict
) -> list[dict[str, Any]]:
    """Fetch up to ``FETCH_PRS_MAX`` recently closed PRs (merged or not)."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/pulls",
        params={
            "state": "closed",
            "sort": "updated",
            "direction": "desc",
            "per_page": FETCH_PRS_MAX,
        },
        headers=headers,
    )
    resp.raise_for_status()
    return [pr for pr in resp.json() if isinstance(pr, dict)]


@with_retry
async def _fetch_recent_commits(
    client: httpx.AsyncClient, owner: str, repo: str, headers: dict, since: datetime
) -> list[dict[str, Any]]:
    """Fetch recent commits on the default branch (since the given timestamp)."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/commits",
        params={
            "since": since.isoformat().replace("+00:00", "Z"),
            "per_page": FETCH_COMMITS_MAX,
        },
        headers=headers,
    )
    resp.raise_for_status()
    return [c for c in resp.json() if isinstance(c, dict)]


@with_retry
async def _fetch_recent_issues(
    client: httpx.AsyncClient, owner: str, repo: str, headers: dict
) -> list[dict[str, Any]]:
    """Fetch up to ``FETCH_ISSUES_MAX`` recently closed issues (excluding PRs)."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues",
        params={
            "state": "closed",
            "sort": "updated",
            "direction": "desc",
            "per_page": FETCH_ISSUES_MAX,
        },
        headers=headers,
    )
    resp.raise_for_status()
    # The issues endpoint includes PRs; the docs guarantee a ``pull_request``
    # key on those, so filter it out — we already have richer PR data.
    return [
        issue
        for issue in resp.json()
        if isinstance(issue, dict) and "pull_request" not in issue
    ]


# ─── summarisation ──────────────────────────────────────────────────────────


def _size_bucket(additions: int, deletions: int) -> str:
    """Bucket a PR by line-changes count. Same crude buckets every team
    sanity-checks against; the LLM doesn't need finer resolution."""
    total = (additions or 0) + (deletions or 0)
    if total <= 50:
        return "small"
    if total <= 300:
        return "medium"
    return "large"


def _summarise_for_prompt(
    prs: list[dict], commits: list[dict], issues: list[dict]
) -> str:
    """Compact textual summary the LLM uses to infer conventions.

    Intentionally small — no diffs, no bodies past the first 200 chars,
    just titles + sizes + label/prefix histograms.
    """
    lines: list[str] = ["RECENT PRS:"]
    for pr in prs[:50]:
        title = (pr.get("title") or "").strip()
        labels = ",".join(
            label.get("name", "") for label in (pr.get("labels") or []) if isinstance(label, dict)
        )
        size = _size_bucket(pr.get("additions", 0), pr.get("deletions", 0))
        merged = pr.get("merged_at") is not None
        lines.append(f"  - [{size}{', merged' if merged else ''}] {title}"
                     + (f"  ({labels})" if labels else ""))

    lines.append("\nRECENT COMMITS (default branch):")
    for c in commits[:50]:
        msg = ((c.get("commit") or {}).get("message") or "").splitlines()[0] if isinstance(c, dict) else ""
        lines.append(f"  - {msg}")

    lines.append("\nRECENT CLOSED ISSUES:")
    for issue in issues[:30]:
        title = (issue.get("title") or "").strip()
        labels = ",".join(
            lab.get("name", "") for lab in (issue.get("labels") or []) if isinstance(lab, dict)
        )
        lines.append(f"  - {title}" + (f"  ({labels})" if labels else ""))

    return "\n".join(lines)


_EXTRACTION_PROMPT = """You are analysing a software team's GitHub history to infer the conventions \
they use when writing tickets, PRs, and issues. Output a single JSON object describing what you observe.

SAMPLE FROM THE TEAM'S REPO:
{summary}

Return ONLY this JSON shape (no markdown fences, no commentary):
{{
  "title_format": "semantic_commit" | "imperative" | "sentence" | "as_a_user",
  "typical_title_length_chars": <integer, the median title length in characters across PRs+issues>,
  "size_distribution": {{"small": <0..1>, "medium": <0..1>, "large": <0..1>}},
  "common_labels": [<up to 10 most-used label strings, lowercase>],
  "commit_prefix_convention": <string, e.g. "feat: / fix: / chore:" or "none">,
  "acceptance_criteria_style": "checklist" | "gherkin" | "none",
  "summary_sentence": <one short sentence, ≤120 chars, describing the team's overall style>
}}

Rules:
- "title_format" — pick the BEST single match for the dominant PR-title shape.
  * "semantic_commit" = "feat: …", "fix: …", "chore: …" prefixes are the norm.
  * "imperative" = "Add invite emails", "Prevent duplicate session join".
  * "sentence" = full descriptive sentences ("Invite emails should be sent on team join").
  * "as_a_user" = explicit user-story format ("As a … I want … so that …").
- "size_distribution" — three floats that SUM TO ~1.0, based on the PR size buckets above.
- "common_labels" — only labels actually present in the data; omit if the team doesn't label.
- "acceptance_criteria_style" — infer from issue/PR bodies if present; default to "none" when unclear.
- Do NOT invent data. If a field is genuinely undeterminable, omit it (except `summary_sentence`, which is required).
"""


def _parse_extraction_response(raw: str) -> dict[str, Any]:
    """Parse the LLM JSON response; tolerate the occasional fenced response."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RepoAnalysisError(f"AI returned invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise RepoAnalysisError(f"AI returned {type(data).__name__}, expected object")
    if not data.get("summary_sentence"):
        raise RepoAnalysisError("AI response missing required `summary_sentence`")
    return data


# ─── public API ─────────────────────────────────────────────────────────────


async def _load_fresh_cached_profile(
    project_id: str, repo_full_name: str, db: AsyncSession
) -> dict | None:
    """Return the latest complete profile if it's within TTL and matches the repo, else None."""
    job = (
        await db.execute(
            select(RepoAnalysisJob)
            .where(
                RepoAnalysisJob.project_id == project_id,
                RepoAnalysisJob.status == "complete",
            )
            .order_by(desc(RepoAnalysisJob.completed_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if not job or not job.completed_at or not job.profile_json:
        return None
    if job.repo_full_name and job.repo_full_name != repo_full_name:
        # repo_url changed under us — invalidate.
        return None
    age = datetime.now(UTC) - job.completed_at
    if age > PROFILE_TTL:
        return None
    return dict(job.profile_json)


async def ensure_repo_profile(
    *, project: Project, db: AsyncSession
) -> dict[str, Any]:
    """Return a fresh-or-cached repo conventions profile for the project.

    Raises :class:`RepoAnalysisError` on any failure — caller should fall
    back to the balanced style.
    """
    owner_repo = parse_repo_url(project.repo_url)
    if not owner_repo:
        raise RepoAnalysisError("Project has no parseable repo_url")
    owner, repo = owner_repo
    repo_full_name = f"{owner}/{repo}"

    cached = await _load_fresh_cached_profile(project.id, repo_full_name, db)
    if cached is not None:
        logger.info("Re-using cached repo profile for project %s", project.id)
        return cached

    installation_id = await _find_installation_id(project.org_id, db)
    if not installation_id:
        raise RepoAnalysisError("Org has no active GitHub App installation")

    job = RepoAnalysisJob(
        project_id=project.id,
        org_id=project.org_id,
        status="running",
        repo_full_name=repo_full_name,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    try:
        token_data = await get_installation_token(installation_id)
        headers = _auth_headers(token_data["token"])
        since = datetime.now(UTC) - timedelta(days=FETCH_WINDOW_DAYS)

        async with httpx.AsyncClient(timeout=30) as client:
            prs = await _fetch_recent_prs(client, owner, repo, headers)
            commits = await _fetch_recent_commits(client, owner, repo, headers, since=since)
            issues = await _fetch_recent_issues(client, owner, repo, headers)

        if not prs and not commits and not issues:
            raise RepoAnalysisError(
                "Repo returned no PRs / commits / issues — nothing to analyse"
            )

        summary = _summarise_for_prompt(prs, commits, issues)
        prompt = _EXTRACTION_PROMPT.format(summary=summary)

        ai = await get_ai_client(project.org_id, db, task="default")
        logger.info(
            "Extracting repo conventions for %s (provider=%s, %d PRs, %d commits, %d issues)",
            repo_full_name,
            ai.provider,
            len(prs),
            len(commits),
            len(issues),
        )
        raw = await ai.chat(messages=[{"role": "user", "content": prompt}], max_tokens=1024)
        profile = _parse_extraction_response(raw)

        job.profile_json = profile
        job.status = "complete"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        return profile

    except RepoAnalysisError as exc:
        # Preserve the real exception message in job.error — the old code
        # overwrote it with a generic string, which made the row useless
        # for oncall root-cause queries (SELECT error FROM repo_analysis_jobs).
        logger.warning(
            "Repo analysis failed (RepoAnalysisError)",
            extra={
                "project_id": project.id,
                "org_id": project.org_id,
                "repo": repo_full_name,
                "exc_type": exc.__class__.__name__,
            },
        )
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.now(UTC)
        await db.commit()
        raise
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Repo analysis failed (GitHub API)",
            extra={
                "project_id": project.id,
                "org_id": project.org_id,
                "repo": repo_full_name,
                "status_code": exc.response.status_code,
            },
        )
        job.status = "failed"
        job.error = f"GitHub API error: {exc.response.status_code} — {exc.response.text[:200]}"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        raise RepoAnalysisError(f"GitHub API error: {exc.response.status_code}") from exc
    except Exception as exc:
        logger.exception(
            "Repo analysis failed (unexpected)",
            extra={
                "project_id": project.id,
                "org_id": project.org_id,
                "repo": repo_full_name,
                "exc_type": exc.__class__.__name__,
            },
        )
        job.status = "failed"
        job.error = f"{exc.__class__.__name__}: {exc}"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        raise RepoAnalysisError(f"{exc.__class__.__name__}: {exc}") from exc
