"""Behavioural test for the GitHub scope filter.

This test does not run a full scan (that needs an installation token + the
AI client). It directly invokes ``apply_scope_filter`` against a fixture
repo list to validate that the connector's filtering contract holds.
"""

from __future__ import annotations

import json

from src.app.models.integration import OrgIntegration
from src.app.services.integration_scope_filter import apply_scope_filter


def _intg(included_scopes: list[str] | None) -> OrgIntegration:
    meta = None if included_scopes is None else json.dumps({"included_scopes": included_scopes})
    return OrgIntegration(
        id="i-gh-1",
        org_id="org-1",
        provider="github",
        category="version_control",
        auth_type="github_app",
        status="active",
        access_token="ignored",
        scopes="[]",
        metadata_json=meta,
        connected_by="u-1",
    )


_REPOS = [
    {"id": 1, "full_name": "acme/api"},
    {"id": 2, "full_name": "acme/web"},
    {"id": 3, "full_name": "acme/infra"},
    {"id": 4, "full_name": "acme/docs"},
    {"id": 5, "full_name": "acme/internal-secrets"},
]


def test_no_selection_passes_all_repos():
    intg = _intg(included_scopes=None)
    allowed, filtered = apply_scope_filter(intg, _REPOS, key_fn=lambda r: str(r["id"]))
    assert allowed == _REPOS
    assert filtered == []


def test_partial_selection_splits_correctly():
    intg = _intg(included_scopes=["1", "3"])
    allowed, filtered = apply_scope_filter(intg, _REPOS, key_fn=lambda r: str(r["id"]))
    assert {r["full_name"] for r in allowed} == {"acme/api", "acme/infra"}
    assert {r["full_name"] for r in filtered} == {"acme/web", "acme/docs", "acme/internal-secrets"}


def test_empty_selection_filters_everything():
    """User explicitly narrowed to nothing → all repos go to filtered."""
    intg = _intg(included_scopes=[])
    allowed, filtered = apply_scope_filter(intg, _REPOS, key_fn=lambda r: str(r["id"]))
    assert allowed == []
    assert filtered == _REPOS
