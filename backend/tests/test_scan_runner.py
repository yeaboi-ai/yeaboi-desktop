"""Tests for ScanRunner — core scan lifecycle."""

import pytest
from sqlalchemy import select

from src.app.models.integration import IntegrationScanLog, OrgIntegration
from src.app.models.organization import Organization, Team
from src.app.models.user import User
from src.app.services.connectors.scan_runner import ScanRunner

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def seed_data(db_session):
    """Create the minimal entity graph needed for ScanRunner tests.

    Returns (org_id, team_id, integration_id, user_id).
    """
    user = User(email="scanner@example.com", name="Scanner")
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    await db_session.flush()

    team = Team(org_id=org.id, name="Engineering", slug="engineering")
    db_session.add(team)
    await db_session.flush()

    integration = OrgIntegration(
        org_id=org.id,
        provider="github",
        category="code",
        auth_type="oauth",
        status="active",
        connected_by=user.id,
    )
    db_session.add(integration)
    await db_session.flush()

    return org.id, team.id, integration.id, user.id


@pytest.fixture
def runner(db_session, seed_data):
    org_id, team_id, integration_id, _user_id = seed_data
    return ScanRunner(db=db_session, integration_id=integration_id, org_id=org_id, team_id=team_id)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_start_scan_creates_log(runner, db_session):
    """Verify scan log created with status='running'."""
    scan_log = await runner.start(scan_type="full")

    assert scan_log.id is not None
    assert scan_log.status == "running"
    assert scan_log.scan_type == "full"
    assert scan_log.started_at is not None
    assert scan_log.resources_scanned == 0

    # Confirm it's persisted
    result = await db_session.execute(select(IntegrationScanLog).where(IntegrationScanLog.id == scan_log.id))
    persisted = result.scalar_one()
    assert persisted.status == "running"


async def test_record_item_increments_counters(runner, db_session):
    """Verify resources_scanned, ai_calls_made, ai_tokens_used increment."""
    await runner.start()

    await runner.record_item(
        resource_path="repo/README.md",
        action="created",
        ai_model="claude-sonnet-4-20250514",
        tokens_used=150,
    )
    assert runner.scan_log.resources_scanned == 1
    assert runner.scan_log.ai_calls_made == 1
    assert runner.scan_log.ai_tokens_used == 150

    await runner.record_item(
        resource_path="repo/src/main.py",
        action="created",
        ai_model="claude-sonnet-4-20250514",
        tokens_used=200,
    )
    assert runner.scan_log.resources_scanned == 2
    assert runner.scan_log.ai_calls_made == 2
    assert runner.scan_log.ai_tokens_used == 350


async def test_upsert_entry_creates_new(runner, db_session):
    """Verify new DirectoryEntry created with correct fields."""
    await runner.start()

    entry, action = await runner.upsert_entry(
        path="frontend/design-system",
        title="Design System",
        content="# Design System\nTokens and components.",
        category="frontend",
        source_ref="https://github.com/org/repo/tree/main/design-system",
    )

    assert action == "created"
    assert entry.id is not None
    assert entry.team_id == runner.team_id
    assert entry.path == "frontend/design-system"
    assert entry.title == "Design System"
    assert entry.source == "scan"
    assert entry.scan_status == "complete"
    assert entry.integration_id == runner.integration_id
    assert entry.content_hash is not None
    assert entry.source_ref == "https://github.com/org/repo/tree/main/design-system"
    assert runner.scan_log.entries_created == 1


async def test_upsert_entry_populates_description_from_bold_line(runner, db_session):
    """Description is extracted from the first bold line at scan time."""
    await runner.start()

    entry, _ = await runner.upsert_entry(
        path="frontend/router",
        title="Router",
        content="**Client-side router with nested routes.**\n\n## Details\nMore info here.",
        category="frontend",
    )

    assert entry.description == "Client-side router with nested routes."


async def test_upsert_entry_description_falls_back_to_first_line(runner, db_session):
    """When no bold line is present, first non-empty line wins (truncated)."""
    await runner.start()

    entry, _ = await runner.upsert_entry(
        path="backend/jobs",
        title="Background Jobs",
        content="\n# Jobs\nDetails about jobs.",
        category="backend",
    )

    assert entry.description == "# Jobs"


async def test_upsert_entry_updates_description_on_content_change(runner, db_session):
    """Re-scanning with new content refreshes the stored description."""
    await runner.start()

    entry1, _ = await runner.upsert_entry(
        path="infra/queue",
        title="Queue",
        content="**Old summary.**\nBody v1",
        category="infra",
    )
    assert entry1.description == "Old summary."

    entry2, action = await runner.upsert_entry(
        path="infra/queue",
        title="Queue",
        content="**New summary.**\nBody v2",
        category="infra",
    )
    assert action == "updated"
    assert entry2.description == "New summary."


async def test_upsert_entry_skips_unchanged(runner, db_session):
    """Verify same entry returned when content_hash matches (no update)."""
    await runner.start()

    entry1, action1 = await runner.upsert_entry(
        path="backend/api",
        title="API Layer",
        content="# API\nREST endpoints.",
        category="backend",
    )
    assert action1 == "created"
    created_count_after_first = runner.scan_log.entries_created

    # Upsert with identical content
    entry2, action2 = await runner.upsert_entry(
        path="backend/api",
        title="API Layer",
        content="# API\nREST endpoints.",
        category="backend",
    )

    assert action2 == "unchanged"
    assert entry2.id == entry1.id
    # entries_created should NOT have incremented
    assert runner.scan_log.entries_created == created_count_after_first
    # entries_updated should NOT have incremented either (content unchanged)
    assert runner.scan_log.entries_updated == 0


async def test_complete_marks_success(runner, db_session, seed_data):
    """Verify status='success' and completed_at set."""
    _org_id, _team_id, integration_id, _user_id = seed_data

    await runner.start()
    await runner.complete()

    assert runner.scan_log.status == "success"
    assert runner.scan_log.completed_at is not None

    # Verify OrgIntegration.last_scan_at was updated
    result = await db_session.execute(select(OrgIntegration).where(OrgIntegration.id == integration_id))
    integration = result.scalar_one()
    assert integration.last_scan_at is not None


async def test_fail_marks_failed(runner):
    """Verify status='failed' and error_message set."""
    await runner.start()
    await runner.fail("GitHub API rate limit exceeded")

    assert runner.scan_log.status == "failed"
    assert runner.scan_log.error_message == "GitHub API rate limit exceeded"
    assert runner.scan_log.completed_at is not None
