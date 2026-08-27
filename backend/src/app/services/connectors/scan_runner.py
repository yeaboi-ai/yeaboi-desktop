"""Scan runner — core lifecycle for integration scans.

Manages creating scan logs, recording scanned items, upserting directory
entries (with SHA-256 content-hash dedup), and completing/failing scans.
"""

import asyncio
import functools
import hashlib
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.directory import DirectoryEntry
from ...models.integration import IntegrationScanItem, IntegrationScanLog, OrgIntegration
from ...models.notification import Notification

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Retry decorator for transient errors
# ---------------------------------------------------------------------------

_TRANSIENT_STATUS_CODES = {429, 500, 502, 503}
_MAX_ATTEMPTS = 3
_BASE_DELAY = 1.0  # seconds
_BACKOFF_FACTOR = 4  # 1s, 4s, 16s


def with_retry(fn):
    """Retry an async function on transient errors (429, rate limit, timeout, 5xx).

    3 attempts with exponential backoff: 1 s -> 4 s -> 16 s.
    """

    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        last_exc: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                return await fn(*args, **kwargs)
            except Exception as exc:
                if not _is_transient(exc):
                    raise
                last_exc = exc
                if attempt < _MAX_ATTEMPTS - 1:
                    delay = _BASE_DELAY * (_BACKOFF_FACTOR**attempt)
                    logger.warning(
                        "Transient error on attempt %d/%d for %s, retrying in %.1fs: %s",
                        attempt + 1,
                        _MAX_ATTEMPTS,
                        fn.__name__,
                        delay,
                        exc,
                    )
                    await asyncio.sleep(delay)
        raise last_exc  # type: ignore[misc]

    return wrapper


def _is_transient(exc: Exception) -> bool:
    """Return True if the exception looks like a transient / retryable error."""
    # Check for status_code attribute (httpx, aiohttp, etc.)
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status is not None and int(status) in _TRANSIENT_STATUS_CODES:
        return True

    # Timeouts — both asyncio's hierarchy and httpx's own.
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return True
    try:
        import httpx as _httpx

        if isinstance(
            exc,
            (
                _httpx.TimeoutException,
                _httpx.ConnectError,
                _httpx.RemoteProtocolError,
            ),
        ):
            return True
    except ImportError:
        # httpx is optional for non-HTTP callers of with_retry; if it's not
        # importable here we just skip the check.
        pass

    # Heuristic: check the string representation for common rate-limit messages
    msg = str(exc).lower()
    if "rate limit" in msg or "too many requests" in msg:
        return True

    return False


# ---------------------------------------------------------------------------
# ScanRunner
# ---------------------------------------------------------------------------


class ScanRunner:
    """Drives a single integration scan through its lifecycle.

    Usage::

        runner = ScanRunner(db, integration_id, org_id, team_id)
        scan = await runner.start()
        entry = await runner.upsert_entry(...)
        await runner.record_item(...)
        await runner.complete()
    """

    def __init__(
        self,
        db: AsyncSession,
        integration_id: str,
        org_id: str,
        team_id: str,
        scan_log_id: str | None = None,
    ) -> None:
        self.db = db
        self.integration_id = integration_id
        self.org_id = org_id
        self.team_id = team_id
        self.scan_log: IntegrationScanLog | None = None
        self._scan_log_id = scan_log_id
        self._has_failures = False
        self._status_log: list[str] = []
        self._user_id: str | None = None
        self._provider: str | None = None

    # -- lifecycle ----------------------------------------------------------

    async def start(self, scan_type: str = "full") -> IntegrationScanLog:
        """Load an existing scan log or create a new one."""
        # Load integration to get provider name and connected_by user
        intg_result = await self.db.execute(
            select(OrgIntegration).where(OrgIntegration.id == self.integration_id)
        )
        intg = intg_result.scalar_one_or_none()
        if intg:
            self._user_id = intg.connected_by
            self._provider = intg.provider

        if self._scan_log_id:
            result = await self.db.execute(
                select(IntegrationScanLog).where(IntegrationScanLog.id == self._scan_log_id)
            )
            self.scan_log = result.scalar_one_or_none()
            if self.scan_log:
                logger.info("Scan resumed", extra={"scan_log_id": self.scan_log.id})
                await self._notify("scan_started", f"{self._provider_label} scan started", "Scanning resources...")
                return self.scan_log

        self.scan_log = IntegrationScanLog(
            integration_id=self.integration_id,
            scan_type=scan_type,
            status="running",
            started_at=datetime.now(UTC),
            resources_scanned=0,
            entries_created=0,
            entries_updated=0,
            ai_calls_made=0,
            ai_tokens_used=0,
        )
        self.db.add(self.scan_log)
        await self.db.commit()
        await self._notify("scan_started", f"{self._provider_label} scan started", "Scanning resources...")
        logger.info("Scan started", extra={"scan_log_id": self.scan_log.id, "scan_type": scan_type})
        return self.scan_log

    async def complete(self) -> None:
        """Mark the scan as 'success' (or 'partial') and update timestamps."""
        assert self.scan_log is not None, "Call start() before complete()"
        self.scan_log.status = "partial" if self._has_failures else "success"
        self.scan_log.completed_at = datetime.now(UTC)

        # Update last_scan_at on the integration
        result = await self.db.execute(
            select(OrgIntegration).where(OrgIntegration.id == self.integration_id)
        )
        integration = result.scalar_one_or_none()
        if integration:
            integration.last_scan_at = self.scan_log.completed_at

        scanned = self.scan_log.resources_scanned or 0
        created = self.scan_log.entries_created or 0
        updated = self.scan_log.entries_updated or 0
        body = f"{scanned} resources scanned, {created} created, {updated} updated"

        if self._has_failures:
            await self._notify("scan_partial", f"{self._provider_label} scan completed with issues", body)
        else:
            await self._notify("scan_complete", f"{self._provider_label} scan complete", body)

        await self.db.commit()
        await self._invalidate_directory_cache()
        logger.info(
            "Scan completed",
            extra={"scan_log_id": self.scan_log.id, "status": self.scan_log.status},
        )

    async def fail(self, error_message: str) -> None:
        """Mark the scan as 'failed' with an error message."""
        assert self.scan_log is not None, "Call start() before fail()"
        self.scan_log.status = "failed"
        self.scan_log.error_message = error_message
        self.scan_log.completed_at = datetime.now(UTC)
        await self._notify("scan_failed", f"{self._provider_label} scan failed", error_message)
        await self.db.commit()
        logger.error(
            "Scan failed",
            extra={"scan_log_id": self.scan_log.id, "error": error_message},
        )

    # -- status log ---------------------------------------------------------

    async def log_status(self, message: str) -> None:
        """Append a human-readable status message and commit so polling can see it."""
        self._status_log.append(message)
        if self.scan_log:
            self.scan_log.details_json = json.dumps(self._status_log)
            await self.db.commit()
        logger.info("Scan status: %s", message)

    # -- notifications --------------------------------------------------------

    @property
    def _provider_label(self) -> str:
        labels = {
            "aws": "AWS",
            "github": "GitHub",
            "jira": "Jira",
            "confluence": "Confluence",
            "azure_devops": "Azure DevOps",
            "slack": "Slack",
        }
        return labels.get(self._provider or "", (self._provider or "Integration").title())

    async def _invalidate_directory_cache(self) -> None:
        """Drop the team's cached directory tree + insights after a scan.

        Fail-open: cache errors never propagate (the cache is a perf hint,
        not a correctness boundary).
        """
        try:
            from ..cache import cache_delete

            await cache_delete(
                f"directory:tree:{self.team_id}",
                f"directory:insights:{self.team_id}",
            )
        except Exception:
            logger.debug("Directory cache invalidation failed", exc_info=True)

    async def _notify(self, ntype: str, title: str, body: str | None = None) -> None:
        """Create a notification for the user who connected this integration.

        Additionally mirrors the event to Slack when the org has an active Slack
        integration with a notification_channel_id configured. Slack posting
        failures are swallowed.
        """
        if self._user_id:
            try:
                notif = Notification(
                    user_id=self._user_id,
                    org_id=self.org_id,
                    title=title,
                    body=body,
                    type=ntype,
                    link="/settings#scans",
                )
                self.db.add(notif)
                await self.db.commit()
            except Exception:
                logger.warning("Failed to create scan notification", exc_info=True)

        # Don't echo Slack's own scan events back to Slack — it would be noisy
        # and confusing to see "Slack scan complete" posted into the channel.
        if self._provider == "slack":
            return

        try:
            from ..slack_dispatcher import dispatch_event
            from .slack_notifier import load_admin_team_id

            admin_team_id = await load_admin_team_id(self.db, self.org_id)
            if not admin_team_id:
                return
            await dispatch_event(
                self.db,
                event_type=ntype,
                team_id=admin_team_id,
                payload={
                    "title": title,
                    "body": body,
                    "provider_label": self._provider_label,
                    "failure_summary": body if ntype == "scan_partial" else None,
                    "error": body if ntype == "scan_failed" else None,
                    "stats": {},
                },
            )
        except Exception:
            logger.debug("Slack dispatch failed for notification '%s'", ntype, exc_info=True)

    # -- item recording -----------------------------------------------------

    async def record_item(
        self,
        resource_path: str,
        action: str,
        ai_model: str | None = None,
        tokens_used: int | None = None,
        directory_entry_id: str | None = None,
        reason: str | None = None,
    ) -> IntegrationScanItem:
        """Record a single scanned resource and update aggregate counters."""
        assert self.scan_log is not None, "Call start() before record_item()"

        item = IntegrationScanItem(
            scan_log_id=self.scan_log.id,
            resource_path=resource_path,
            action=action,
            ai_model_used=ai_model,
            tokens_used=tokens_used,
            directory_entry_id=directory_entry_id,
            reason=reason,
        )
        self.db.add(item)

        # Increment counters
        self.scan_log.resources_scanned = (self.scan_log.resources_scanned or 0) + 1
        if ai_model:
            self.scan_log.ai_calls_made = (self.scan_log.ai_calls_made or 0) + 1
        if tokens_used:
            self.scan_log.ai_tokens_used = (self.scan_log.ai_tokens_used or 0) + tokens_used

        if action == "failed":
            self._has_failures = True

        await self.db.commit()
        return item

    # -- directory upsert ---------------------------------------------------

    async def upsert_entry(
        self,
        path: str,
        title: str,
        content: str,
        category: str,
        source_ref: str | None = None,
    ) -> tuple[DirectoryEntry, str]:
        """Create or update a directory entry, skipping unchanged content via SHA-256 hash.

        Returns (entry, action) where action is "created", "updated", or "unchanged".
        """
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        description = _extract_description(content)

        result = await self.db.execute(
            select(DirectoryEntry).where(
                DirectoryEntry.team_id == self.team_id,
                DirectoryEntry.path == path,
            )
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            if existing.content_hash == content_hash:
                logger.debug("Skipping unchanged entry %s", path)
                return existing, "unchanged"

            # Update existing entry
            existing.title = title
            existing.content = content
            existing.description = description
            existing.category = category
            existing.content_hash = content_hash
            existing.source = "scan"
            existing.scan_status = "complete"
            existing.integration_id = self.integration_id
            existing.source_ref = source_ref
            if self.scan_log:
                self.scan_log.entries_updated = (self.scan_log.entries_updated or 0) + 1
            await self.db.commit()
            logger.debug("Updated directory entry %s", path)
            return existing, "updated"

        # Create new entry
        entry = DirectoryEntry(
            team_id=self.team_id,
            path=path,
            title=title,
            content=content,
            description=description,
            category=category,
            content_hash=content_hash,
            source="scan",
            scan_status="complete",
            integration_id=self.integration_id,
            source_ref=source_ref,
        )
        self.db.add(entry)
        if self.scan_log:
            self.scan_log.entries_created = (self.scan_log.entries_created or 0) + 1
        await self.db.commit()
        logger.debug("Created directory entry %s", path)
        return entry, "created"


def _extract_description(content: str | None) -> str | None:
    """Pull the first line of bold text — scan connectors store the 1-2 sentence
    AI summary as a single **bold** line at the top of the content. Falls back
    to the first non-empty line, truncated to fit the column.
    """
    if not content:
        return None
    for line in content.split("\n", 10):
        stripped = line.strip()
        if stripped.startswith("**") and stripped.endswith("**") and len(stripped) > 4:
            return stripped[2:-2].strip()[:500]
        if stripped:
            return stripped[:180]
    return None
