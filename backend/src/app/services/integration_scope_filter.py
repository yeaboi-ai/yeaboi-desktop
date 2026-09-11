"""Centralised scope enforcement for integration scans.

Every connector that walks a list of resources (repos, projects, spaces,
channels) must run that list through :func:`apply_scope_filter` before
sending data to the AI or persisting anything. The helper returns both the
allowed and the filtered-out halves so the connector can emit visible
``skipped: not in scope`` scan items — silent drops are not allowed.

The user's selection lives in ``OrgIntegration.metadata_json`` under
``included_scopes``. Slack uses two parallel lists (``scan_channels`` and
``notification_channels``); :func:`get_included_scopes` normalises that to
the same shape so connectors don't need provider-specific logic.

Empty list means "user has not narrowed scope" → everything is allowed.
This matches the historical behaviour for providers that pre-date the
scope picker. New providers should land in ``status='pending_scope'`` so
the user is forced to select at least one resource before any scan runs.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import TypeVar

from ..models.integration import OrgIntegration

logger = logging.getLogger(__name__)

T = TypeVar("T")


def get_included_scopes(integration: OrgIntegration) -> list[str] | None:
    """Return the user's selected scope keys, or ``None`` if no narrowing applied.

    ``None`` means the integration has not been scoped (allow all). An empty
    list means the user has explicitly selected nothing (allow none) — useful
    for revoking scan access without disconnecting the integration.

    Slack stores scope on two keys (``scan_channels`` for read access and
    ``notification_channels`` for write access). For scan-filtering purposes
    we only care about ``scan_channels``; the notifier checks
    ``notification_channels`` separately.
    """
    if not integration.metadata_json:
        return None
    try:
        meta = json.loads(integration.metadata_json)
    except (ValueError, TypeError):
        logger.warning(
            "Failed to parse metadata_json for integration %s; treating as no-scope",
            integration.id,
        )
        return None

    if integration.provider == "slack":
        raw = meta.get("scan_channels")
    else:
        raw = meta.get("included_scopes")

    if raw is None:
        return None
    if not isinstance(raw, list):
        logger.warning(
            "included_scopes for integration %s is not a list (got %s); ignoring",
            integration.id,
            type(raw).__name__,
        )
        return None
    return [str(s) for s in raw]


def apply_scope_filter(
    integration: OrgIntegration,
    resources: list[T],
    key_fn: Callable[[T], str],
) -> tuple[list[T], list[T]]:
    """Split *resources* into (allowed, filtered_out) based on the user's selection.

    Args:
        integration: The integration whose ``metadata.included_scopes`` to honour.
        resources: All resources discovered from the provider's API.
        key_fn: Maps each resource to the stable identifier the user picked
            via the scope-picker UI. Must match what
            ``integration_scopes.get_available_scopes`` returns as ``id``.

    Returns:
        ``(allowed, filtered_out)`` — both lists, never ``None``. The caller
        is expected to fully scan ``allowed`` and emit a ``skipped: not in
        scope`` scan item for every element of ``filtered_out`` so the user
        can see exactly what we refused to read.

    No-scope (``get_included_scopes`` returns ``None``): everything goes to
    ``allowed`` and ``filtered_out`` is empty. Empty-list selection: nothing
    is allowed and every resource appears in ``filtered_out``.
    """
    selected = get_included_scopes(integration)
    if selected is None:
        return list(resources), []

    selected_set = set(selected)
    allowed: list[T] = []
    filtered_out: list[T] = []
    for r in resources:
        key = key_fn(r)
        if key in selected_set:
            allowed.append(r)
        else:
            filtered_out.append(r)
    return allowed, filtered_out
