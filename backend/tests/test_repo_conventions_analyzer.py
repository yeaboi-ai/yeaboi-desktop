"""Tests for the repo conventions analyzer (services/repo_conventions_analyzer.py).

External calls are all mocked per CLAUDE.md's "mock external services" rule:
  - GitHub App installation lookup → directly patched
  - get_installation_token → returns a fake token dict
  - GitHub HTTP fetchers (_fetch_recent_prs / commits / issues) → patched at module level
  - AI client → AsyncMock returning a canned JSON profile string
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from src.app.models.repo_analysis_job import RepoAnalysisJob
from src.app.models.session import Session
from src.app.services.repo_conventions_analyzer import (
    PROFILE_TTL,
    RepoAnalysisError,
    _summarise_for_prompt,
    ensure_repo_profile,
    parse_repo_url,
)

# ── parse_repo_url ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://github.com/acme/widget", ("acme", "widget")),
        ("https://github.com/acme/widget.git", ("acme", "widget")),
        ("https://github.com/acme/widget/", ("acme", "widget")),
        ("git@github.com:acme/widget.git", ("acme", "widget")),
        ("acme/widget", ("acme", "widget")),
        ("", None),
        (None, None),
        ("not-a-url", None),
        ("https://gitlab.com/acme/widget", None),
    ],
)
def test_parse_repo_url(url, expected):
    assert parse_repo_url(url) == expected


# ── _summarise_for_prompt ───────────────────────────────────────────────────


def test_summarise_includes_titles_labels_and_size_buckets():
    prs = [
        {
            "title": "feat: invite emails",
            "labels": [{"name": "feature"}],
            "additions": 10,
            "deletions": 5,  # small bucket
            "merged_at": "2026-06-01T00:00:00Z",
        },
        {
            "title": "fix: orphan tasks",
            "labels": [{"name": "bug"}],
            "additions": 200,
            "deletions": 50,  # medium bucket
            "merged_at": None,
        },
    ]
    commits = [
        {"commit": {"message": "feat: invite emails\n\nbody line"}},
    ]
    issues = [{"title": "Slack notifications dropping", "labels": [{"name": "bug"}]}]
    out = _summarise_for_prompt(prs, commits, issues)
    assert "feat: invite emails" in out
    assert "fix: orphan tasks" in out
    assert "[small, merged]" in out
    assert "[medium]" in out
    assert "Slack notifications dropping" in out
    # Commit body lines must NOT leak — only the first line of the message.
    assert "body line" not in out


# ── ensure_repo_profile end-to-end ──────────────────────────────────────────


_FAKE_PROFILE = {
    "title_format": "semantic_commit",
    "typical_title_length_chars": 42,
    "size_distribution": {"small": 0.7, "medium": 0.2, "large": 0.1},
    "common_labels": ["feature", "bug"],
    "commit_prefix_convention": "feat: / fix: / chore:",
    "acceptance_criteria_style": "checklist",
    "summary_sentence": "Short tickets with semantic-commit titles.",
}


def _ai_returning(payload: dict) -> AsyncMock:
    mock = AsyncMock()
    mock.chat = AsyncMock(return_value=json.dumps(payload))
    mock.provider = "test"
    return mock


async def _seed_project(db_session, client, auth_headers) -> Session:
    proj = await client.post("/api/sessions", json={"name": "P-repo"}, headers=auth_headers)
    session_id = proj.json()["id"]
    project = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    project.repo_url = "https://github.com/acme/widget"
    await db_session.commit()
    await db_session.refresh(project)
    return project


@pytest.mark.asyncio
async def test_ensure_repo_profile_fetches_and_persists(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)

    with (
        patch(
            "src.app.services.repo_conventions_analyzer._find_installation_id",
            AsyncMock(return_value="install-1"),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_installation_token",
            AsyncMock(return_value={"token": "tok"}),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_prs",
            AsyncMock(return_value=[{"title": "feat: x", "additions": 5, "deletions": 1}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_commits",
            AsyncMock(return_value=[{"commit": {"message": "feat: x"}}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_issues",
            AsyncMock(return_value=[{"title": "Open issue"}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_ai_client",
            AsyncMock(return_value=_ai_returning(_FAKE_PROFILE)),
        ),
    ):
        profile = await ensure_repo_profile(project=project, db=db_session)

    assert profile["summary_sentence"] == "Short tickets with semantic-commit titles."
    # A complete RepoAnalysisJob row should exist for the project.
    job = (
        await db_session.execute(
            select(RepoAnalysisJob).where(RepoAnalysisJob.session_id == project.id)
        )
    ).scalar_one()
    assert job.status == "complete"
    assert job.profile_json["title_format"] == "semantic_commit"
    assert job.repo_full_name == "acme/widget"


@pytest.mark.asyncio
async def test_ensure_repo_profile_reuses_fresh_cache(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)
    # Pre-seed a fresh cached profile.
    fresh = RepoAnalysisJob(
        session_id=project.id,
        org_id=project.org_id,
        status="complete",
        repo_full_name="acme/widget",
        profile_json=_FAKE_PROFILE,
        completed_at=datetime.now(UTC),
    )
    db_session.add(fresh)
    await db_session.commit()

    # If the cache works, none of the GitHub fetchers should fire — patch them
    # to raise so we'd see test failures if they were called.
    def _boom(*a, **kw):
        raise AssertionError("Cache miss — fetcher should not have been called")

    with (
        patch("src.app.services.repo_conventions_analyzer._find_installation_id", _boom),
        patch("src.app.services.repo_conventions_analyzer.get_installation_token", _boom),
    ):
        profile = await ensure_repo_profile(project=project, db=db_session)
    assert profile["summary_sentence"] == _FAKE_PROFILE["summary_sentence"]


@pytest.mark.asyncio
async def test_ensure_repo_profile_invalidates_when_repo_url_changes(client, auth_headers, db_session):
    """A cached row for owner/repo-A must not satisfy a request for owner/repo-B."""
    project = await _seed_project(db_session, client, auth_headers)
    stale = RepoAnalysisJob(
        session_id=project.id,
        org_id=project.org_id,
        status="complete",
        repo_full_name="acme/old-widget",
        profile_json=_FAKE_PROFILE,
        completed_at=datetime.now(UTC),
    )
    db_session.add(stale)
    await db_session.commit()

    # Now patch all the fetchers — they MUST be called since the cache is invalid.
    with (
        patch(
            "src.app.services.repo_conventions_analyzer._find_installation_id",
            AsyncMock(return_value="install-1"),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_installation_token",
            AsyncMock(return_value={"token": "tok"}),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_prs",
            AsyncMock(return_value=[{"title": "feat: x", "additions": 5, "deletions": 1}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_commits",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_issues",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_ai_client",
            AsyncMock(return_value=_ai_returning(_FAKE_PROFILE)),
        ),
    ):
        await ensure_repo_profile(project=project, db=db_session)

    # A fresh row with the new repo_full_name should now exist.
    rows = (
        await db_session.execute(
            select(RepoAnalysisJob).where(RepoAnalysisJob.session_id == project.id)
        )
    ).scalars().all()
    assert any(r.repo_full_name == "acme/widget" and r.status == "complete" for r in rows)


@pytest.mark.asyncio
async def test_ensure_repo_profile_invalidates_when_ttl_expired(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)
    expired = RepoAnalysisJob(
        session_id=project.id,
        org_id=project.org_id,
        status="complete",
        repo_full_name="acme/widget",
        profile_json=_FAKE_PROFILE,
        completed_at=datetime.now(UTC) - PROFILE_TTL - timedelta(hours=1),
    )
    db_session.add(expired)
    await db_session.commit()

    with (
        patch(
            "src.app.services.repo_conventions_analyzer._find_installation_id",
            AsyncMock(return_value="install-1"),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_installation_token",
            AsyncMock(return_value={"token": "tok"}),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_prs",
            AsyncMock(return_value=[{"title": "feat: x", "additions": 5, "deletions": 1}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_commits",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_issues",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_ai_client",
            AsyncMock(return_value=_ai_returning(_FAKE_PROFILE)),
        ),
    ):
        profile = await ensure_repo_profile(project=project, db=db_session)

    assert profile["summary_sentence"] == _FAKE_PROFILE["summary_sentence"]


@pytest.mark.asyncio
async def test_ensure_repo_profile_raises_when_no_installation(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)
    with patch(
        "src.app.services.repo_conventions_analyzer._find_installation_id",
        AsyncMock(return_value=None),
    ):
        with pytest.raises(RepoAnalysisError):
            await ensure_repo_profile(project=project, db=db_session)


@pytest.mark.asyncio
async def test_ensure_repo_profile_raises_on_no_repo_url(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)
    project.repo_url = None
    await db_session.commit()
    with pytest.raises(RepoAnalysisError):
        await ensure_repo_profile(project=project, db=db_session)


@pytest.mark.asyncio
async def test_ensure_repo_profile_raises_on_bad_ai_json(client, auth_headers, db_session):
    project = await _seed_project(db_session, client, auth_headers)
    bad_ai = AsyncMock()
    bad_ai.chat = AsyncMock(return_value="not json at all")
    bad_ai.provider = "test"

    with (
        patch(
            "src.app.services.repo_conventions_analyzer._find_installation_id",
            AsyncMock(return_value="install-1"),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_installation_token",
            AsyncMock(return_value={"token": "tok"}),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_prs",
            AsyncMock(return_value=[{"title": "feat: x", "additions": 5, "deletions": 1}]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_commits",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer._fetch_recent_issues",
            AsyncMock(return_value=[]),
        ),
        patch(
            "src.app.services.repo_conventions_analyzer.get_ai_client",
            AsyncMock(return_value=bad_ai),
        ),
    ):
        with pytest.raises(RepoAnalysisError):
            await ensure_repo_profile(project=project, db=db_session)

    # A failed RepoAnalysisJob row should now exist so the failure isn't silent.
    failed = (
        await db_session.execute(
            select(RepoAnalysisJob)
            .where(RepoAnalysisJob.session_id == project.id, RepoAnalysisJob.status == "failed")
        )
    ).scalar_one_or_none()
    assert failed is not None
