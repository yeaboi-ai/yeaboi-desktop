"""Unit tests for the centralised scope filter helper."""

from __future__ import annotations

import json

from src.app.models.integration import OrgIntegration
from src.app.services.integration_scope_filter import (
    apply_scope_filter,
    get_included_scopes,
)


def _make(provider: str = "jira", metadata: dict | None = None) -> OrgIntegration:
    return OrgIntegration(
        id="i-1",
        org_id="org-1",
        provider=provider,
        category="issue_tracking",
        auth_type="oauth",
        status="active",
        access_token="ignored",
        scopes="[]",
        metadata_json=json.dumps(metadata) if metadata is not None else None,
        connected_by="u-1",
    )


def test_get_included_scopes_none_when_unset():
    intg = _make()
    assert get_included_scopes(intg) is None


def test_get_included_scopes_returns_list():
    intg = _make(metadata={"included_scopes": ["a", "b"]})
    assert get_included_scopes(intg) == ["a", "b"]


def test_get_included_scopes_handles_slack_scan_channels():
    intg = _make(provider="slack", metadata={"scan_channels": ["C1", "C2"]})
    assert get_included_scopes(intg) == ["C1", "C2"]


def test_get_included_scopes_ignores_bad_metadata_json():
    intg = _make()
    intg.metadata_json = "{not valid json"
    assert get_included_scopes(intg) is None


def test_get_included_scopes_ignores_non_list_value():
    intg = _make(metadata={"included_scopes": "not-a-list"})
    assert get_included_scopes(intg) is None


def test_apply_scope_filter_passes_everything_when_no_scope():
    intg = _make()
    resources = [{"id": "1"}, {"id": "2"}]
    allowed, filtered = apply_scope_filter(intg, resources, key_fn=lambda r: r["id"])
    assert allowed == resources
    assert filtered == []


def test_apply_scope_filter_splits_by_selection():
    intg = _make(metadata={"included_scopes": ["2", "3"]})
    resources = [{"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}]
    allowed, filtered = apply_scope_filter(intg, resources, key_fn=lambda r: r["id"])
    assert [r["id"] for r in allowed] == ["2", "3"]
    assert [r["id"] for r in filtered] == ["1", "4"]


def test_apply_scope_filter_empty_selection_filters_everything():
    """Explicit empty list means the user has narrowed scope to nothing.

    All resources should land in filtered_out so the connector emits visible
    "skipped: not in scope" items rather than silently doing nothing.
    """
    intg = _make(metadata={"included_scopes": []})
    resources = [{"id": "1"}, {"id": "2"}]
    allowed, filtered = apply_scope_filter(intg, resources, key_fn=lambda r: r["id"])
    assert allowed == []
    assert filtered == resources
