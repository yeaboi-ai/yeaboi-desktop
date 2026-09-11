"""Per-provider data-access declarations.

This is the **server-side source of truth** for what we promise customers about
each integration: what we read, what we explicitly do not read, what (if
anything) we write, and how long we retain the resulting directory entries.

The matching client-side metadata in
``frontend/components/integrations/provider-registry.ts`` controls UI labels
and consent screens, but anything customer-facing related to data access
should be derived from this file via the
``GET /api/integrations/{provider}/data-access`` endpoint so we have one
canonical place to update.

Add new providers as the contract in ``docs/integrations/CONTRACT.md`` is
extended. Until a provider has an entry here, the pre-connect summary will
show a generic placeholder and the contract is not satisfied.
"""

from __future__ import annotations

from typing import TypedDict


class DataAccessDeclaration(TypedDict):
    """Structured statement of what an integration reads, doesn't read, and stores."""

    reads: list[str]
    """Concrete data points we fetch from the provider (e.g. "Repository
    metadata: name, default branch, visibility, last push timestamp")."""

    does_not_read: list[str]
    """What we explicitly will not access — the load-bearing customer promise."""

    writes: list[str]
    """What we send back to the provider, if anything. Empty list means
    read-only. Slack writes notifications; everything else is read-only."""

    retention_days: int
    """How long we keep the resulting directory entries before purging. -1
    means "kept until the user disconnects" (current default for most
    providers)."""

    summary: str
    """One-sentence plain-English summary, suitable for the Trust page
    header. Should restate the most surprising / important fact."""


_DECLARATIONS: dict[str, DataAccessDeclaration] = {
    "github": {
        "reads": [
            "Repository metadata: name, default branch, visibility, last push timestamp",
            "A fixed list of config files from each selected repo: package.json, "
            "pnpm-workspace.yaml, requirements.txt, pyproject.toml, Dockerfile, "
            "docker-compose.yml, README.md, .github/workflows/*",
            "Workflow run summaries (success/failure counts) for the selected repos",
        ],
        "does_not_read": [
            "Your full source code — we never clone repositories",
            "Repository secrets, deploy keys, or environment values",
            "Private repository contents outside the file list above",
            "Issue/PR comments or discussions",
            "Repositories you did not select in the scope picker",
        ],
        "writes": [],
        "retention_days": -1,
        "summary": (
            "We read repository metadata and a fixed list of config files from "
            "the repos you select. We never push, never read your full codebase, "
            "and never see secrets."
        ),
    },
    "jira": {
        "reads": [
            "Session metadata: key, name, lead, issue counts",
            "Sprint metadata for projects with scrum boards",
            "Up to the 200 most recent issues per project (summary, status, "
            "assignee, labels, story points)",
        ],
        "does_not_read": [
            "Issue comments or comment threads",
            "Issue attachments or file uploads",
            "Worklog entries or time-tracking notes",
            "Projects you did not select in the scope picker",
            "User profile details beyond display name",
        ],
        "writes": [],
        "retention_days": -1,
        "summary": (
            "We read project metadata, sprints, and recent issues from the "
            "projects you select. We never modify tickets, never read "
            "attachments, and never see comments."
        ),
    },
    "confluence": {
        "reads": [
            "Space metadata: key, name, description, type",
            "Up to 50 recent pages per space (page title and body, capped at "
            "50KB of body per page)",
            "Page hierarchy (parent-child relationships) for navigation context",
        ],
        "does_not_read": [
            "Page attachments or file uploads",
            "Page comments or inline comments",
            "Page version history or restorable revisions",
            "Page restrictions / per-page permission lists",
            "Spaces you did not select in the scope picker",
        ],
        "writes": [],
        "retention_days": -1,
        "summary": (
            "We read space metadata and up to 50 recent pages per space (50KB "
            "max per page). We strip HTML and run secret-detection before "
            "sending content to AI. We never modify pages, never read "
            "attachments, and never see comments."
        ),
    },
}

# Provider-specific revocation endpoints. When set, ``POST /revoke`` calls these
# in addition to deleting the row from our database, so the token is
# invalidated at the source. ``None`` means we can only delete our local copy
# (still safe — the access token is encrypted and we never hand it out — but
# the provider may consider its grant still active until the user revokes
# from the provider's UI).
REVOKE_URLS: dict[str, str | None] = {
    # GitHub App installation revocation requires the App JWT, not the user
    # token — handled inline in the revoke handler.
    "github": None,
    # Atlassian shared revoke endpoint. POST with {token, client_id, client_secret}.
    "jira": "https://auth.atlassian.com/oauth/revoke",
    "confluence": "https://auth.atlassian.com/oauth/revoke",
    # Linear has its own endpoint; add when we implement Linear scope picker.
    "linear": "https://api.linear.app/oauth/revoke",
    # Slack: https://slack.com/api/auth.revoke (uses GET with token=)
    "slack": "https://slack.com/api/auth.revoke",
}


def get_data_access(provider: str) -> DataAccessDeclaration | None:
    """Return the declaration for *provider*, or ``None`` if not yet declared.

    Providers without a declaration should be treated as not yet contract-
    compliant — the frontend should show a generic "scope under review"
    placeholder rather than guessing.
    """
    return _DECLARATIONS.get(provider)


def get_revoke_url(provider: str) -> str | None:
    """Return the provider's revoke endpoint, or ``None`` if it has none.

    The caller is responsible for the request format (some providers use
    POST with form-encoded body, others use GET with query params, GitHub
    App uses the App JWT). See the revoke endpoint in routers/integrations.py
    for the dispatch table.
    """
    return REVOKE_URLS.get(provider)
