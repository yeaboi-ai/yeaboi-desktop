"""Unit tests for orchestrator state machine and prompt assembly."""

from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.base import gen_uuid
from src.app.models.board import Board, BoardColumn, Card
from src.app.models.organization import Organization, Team
from src.app.models.session import Session
from src.app.models.user import User
from src.app.orchestrator.agent_runner import run_agent
from src.app.orchestrator.prompt_assembler import assemble_prompt
from src.app.orchestrator.state_machine import can_transition, get_allowed_transitions

# ─── State Machine ───────────────────────────────────────────────────────────


def test_state_transitions():
    assert can_transition(None, "investigating")
    assert can_transition("investigating", "implementing")
    assert can_transition("implementing", "reviewing")
    assert can_transition("reviewing", "pr_open")
    assert can_transition("pr_open", "done")
    assert not can_transition("done", "investigating")
    assert not can_transition("investigating", "done")


def test_allowed_transitions():
    assert get_allowed_transitions(None) == {"investigating"}
    assert "implementing" in get_allowed_transitions("investigating")
    assert get_allowed_transitions("done") == set()


def test_failed_can_retry():
    assert "investigating" in get_allowed_transitions("failed")
    assert "idle" in get_allowed_transitions("failed")


def test_pr_open_can_reject_back():
    assert "implementing" in get_allowed_transitions("pr_open")
    assert "done" in get_allowed_transitions("pr_open")


def test_reviewing_can_send_back():
    assert "implementing" in get_allowed_transitions("reviewing")
    assert "pr_open" in get_allowed_transitions("reviewing")


# ─── Prompt Assembly ─────────────────────────────────────────────────────────


def test_prompt_assembly():
    prompt = assemble_prompt("Fix login bug", "Users can't log in", "investigating", "# My Session")
    assert "Fix login bug" in prompt
    assert "investigating" in prompt.lower() or "investigate" in prompt.lower()
    assert "My Session" in prompt


def test_prompt_assembly_without_agents_md():
    prompt = assemble_prompt("Add feature", "New feature", "implementing")
    assert "Add feature" in prompt
    assert "implementing" in prompt.lower() or "implement" in prompt.lower()


def test_prompt_includes_description():
    prompt = assemble_prompt("Title", "The full description here", "reviewing")
    assert "The full description here" in prompt


def test_prompt_fallback_for_unknown_stage():
    prompt = assemble_prompt("Title", "Desc", "unknown_stage")
    assert "Title" in prompt
    assert "Desc" in prompt


# ─── Agent Runner ─────────────────────────────────────────────────────────────


async def test_agent_runner_handles_ai_failure():
    """run_agent now routes through the AI provider rather than a CLI. When
    the AI call raises, it should return a structured failure dict instead
    of propagating the exception."""
    from unittest.mock import AsyncMock, patch

    with patch(
        "src.app.orchestrator.agent_runner.get_ai_client",
        AsyncMock(side_effect=RuntimeError("no provider configured")),
    ):
        result = await run_agent("hello")

    assert result["success"] is False
    assert result["error"]
    assert len(result["error"]) > 0
    assert result["files"] == {}


# ─── Slack dispatch_event wiring ──────────────────────────────────────────────


async def _setup_card_fixtures(db_session):
    """Create org, team, project, board, column, and card for orchestrator tests."""
    org = Organization(id=gen_uuid(), name="Test Org", slug=gen_uuid()[:8])
    db_session.add(org)
    await db_session.flush()

    team = Team(id=gen_uuid(), org_id=org.id, name="Test Team", slug=gen_uuid()[:8])
    db_session.add(team)
    await db_session.flush()

    user = User(id=gen_uuid(), email="orch@example.com", name="Orch User")
    db_session.add(user)
    await db_session.flush()

    project = Session(
        id=gen_uuid(),
        name="Test Session",
        org_id=org.id,
        team_id=team.id,
        owner_id=user.id,
    )
    db_session.add(project)
    await db_session.flush()

    board = Board(id=gen_uuid(), session_id=project.id, org_id=org.id)
    db_session.add(board)
    await db_session.flush()

    col = BoardColumn(id=gen_uuid(), board_id=board.id, name="To Do", position=0)
    db_session.add(col)
    await db_session.flush()

    card = Card(id=gen_uuid(), column_id=col.id, title="Test Card", position=0)
    db_session.add(card)
    await db_session.commit()

    return card, board, project


@pytest.mark.anyio
async def test_dispatch_event_called_on_card_failed(db_session):
    """dispatch_event is awaited with event_type=card_failed when _process_card raises."""
    from unittest.mock import MagicMock

    from src.app.orchestrator.runner import _process_card_standalone

    card, board, project = await _setup_card_fixtures(db_session)

    # Build a mock context manager that yields our real db_session
    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_ctx

    with (
        patch("src.app.orchestrator.runner._process_card", side_effect=RuntimeError("agent crash")),
        patch("src.app.orchestrator.runner.get_session_factory", return_value=mock_factory),
        patch("src.app.services.notification_service.notify", new_callable=AsyncMock),
        patch("src.app.orchestrator.runner.dispatch_event", new_callable=AsyncMock) as mock_dispatch,
    ):
        await _process_card_standalone(card.id, board.id, "https://github.com/test/repo", project.id)

    mock_dispatch.assert_awaited_once()
    call_kwargs = mock_dispatch.call_args
    assert call_kwargs.kwargs.get("event_type") == "card_failed" or (
        len(call_kwargs.args) > 1 and call_kwargs.args[1] == "card_failed"
    )
    assert call_kwargs.kwargs.get("team_id") == project.team_id or (
        len(call_kwargs.args) > 2 and call_kwargs.args[2] == project.team_id
    )


@pytest.mark.anyio
async def test_dispatch_event_called_on_card_auto_approved(db_session):
    """dispatch_event is awaited with event_type=card_auto_approved when PR is auto-merged."""
    from src.app.orchestrator.runner import _process_card

    card, board, project = await _setup_card_fixtures(db_session)
    card.priority = "low"
    card.auto_approve = True
    await db_session.commit()

    pr_url = "https://github.com/test/repo/pull/1"

    with (
        patch("src.app.orchestrator.runner.run_agent", new_callable=AsyncMock) as mock_agent,
        patch("src.app.orchestrator.runner.create_branch"),
        patch("src.app.orchestrator.runner.commit_files"),
        patch("src.app.orchestrator.runner.open_pull_request", return_value=pr_url),
        patch("src.app.orchestrator.runner.get_repo_tree", return_value=""),
        patch("src.app.orchestrator.runner.get_file_content", return_value=""),
        patch("src.app.orchestrator.workspace.merge_pull_request", return_value=True),
        patch("src.app.services.notification_service.notify", new_callable=AsyncMock),
        patch("src.app.orchestrator.runner.dispatch_event", new_callable=AsyncMock) as mock_dispatch,
    ):
        mock_agent.return_value = {
            "success": True,
            "output": "done",
            "files": {"src/main.py": "print('hi')"},
            "error": None,
        }
        await _process_card(card, board.id, "https://github.com/test/repo", db_session)

    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None))
        for c in mock_dispatch.call_args_list
    ]
    assert "card_auto_approved" in event_types


@pytest.mark.anyio
async def test_dispatch_event_called_on_pr_ready(db_session):
    """dispatch_event is awaited with event_type=pr_ready when PR is not auto-approved."""
    from src.app.orchestrator.runner import _process_card

    card, board, project = await _setup_card_fixtures(db_session)
    card.priority = "high"  # high priority → no auto-approve
    card.auto_approve = False
    await db_session.commit()

    pr_url = "https://github.com/test/repo/pull/2"

    with (
        patch("src.app.orchestrator.runner.run_agent", new_callable=AsyncMock) as mock_agent,
        patch("src.app.orchestrator.runner.create_branch"),
        patch("src.app.orchestrator.runner.commit_files"),
        patch("src.app.orchestrator.runner.open_pull_request", return_value=pr_url),
        patch("src.app.orchestrator.runner.get_repo_tree", return_value=""),
        patch("src.app.orchestrator.runner.get_file_content", return_value=""),
        patch("src.app.services.notification_service.notify", new_callable=AsyncMock),
        patch("src.app.orchestrator.runner.dispatch_event", new_callable=AsyncMock) as mock_dispatch,
    ):
        mock_agent.return_value = {
            "success": True,
            "output": "done",
            "files": {"src/main.py": "print('hi')"},
            "error": None,
        }
        await _process_card(card, board.id, "https://github.com/test/repo", db_session)

    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None))
        for c in mock_dispatch.call_args_list
    ]
    assert "pr_ready" in event_types


# ─── Column lifecycle flag lookup ────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_column_id_by_role_uses_flag_first(db_session):
    """The orchestrator finds lifecycle columns by flag, ignoring the column name."""
    from src.app.orchestrator.runner import _get_column_id_by_role

    org = Organization(id=gen_uuid(), name="Flag Org", slug=gen_uuid()[:8])
    db_session.add(org)
    await db_session.flush()
    team = Team(id=gen_uuid(), org_id=org.id, name="Flag Team", slug=gen_uuid()[:8])
    db_session.add(team)
    await db_session.flush()
    user = User(id=gen_uuid(), email="flag@example.com", name="Flag User")
    db_session.add(user)
    await db_session.flush()
    project = Session(id=gen_uuid(), name="Flag Session", org_id=org.id, team_id=team.id, owner_id=user.id)
    db_session.add(project)
    await db_session.flush()
    board = Board(id=gen_uuid(), session_id=project.id, org_id=org.id)
    db_session.add(board)
    await db_session.flush()

    # Rename "Done" → "Shipped" but keep is_done_state=True. Flag lookup must
    # still find it without falling back to a name match.
    shipped = BoardColumn(
        id=gen_uuid(),
        board_id=board.id,
        name="Shipped",
        position=0,
        is_done_state=True,
    )
    db_session.add(shipped)
    await db_session.commit()

    col_id = await _get_column_id_by_role(board.id, "done", db_session, fallback_name="Done")
    assert col_id == shipped.id


@pytest.mark.anyio
async def test_get_column_id_by_role_falls_back_to_name(db_session):
    """When no column has the flag, the legacy name match still resolves."""
    from src.app.orchestrator.runner import _get_column_id_by_role

    org = Organization(id=gen_uuid(), name="Fallback Org", slug=gen_uuid()[:8])
    db_session.add(org)
    await db_session.flush()
    team = Team(id=gen_uuid(), org_id=org.id, name="Fallback Team", slug=gen_uuid()[:8])
    db_session.add(team)
    await db_session.flush()
    user = User(id=gen_uuid(), email="fb@example.com", name="FB User")
    db_session.add(user)
    await db_session.flush()
    project = Session(id=gen_uuid(), name="FB Session", org_id=org.id, team_id=team.id, owner_id=user.id)
    db_session.add(project)
    await db_session.flush()
    board = Board(id=gen_uuid(), session_id=project.id, org_id=org.id)
    db_session.add(board)
    await db_session.flush()

    # Pre-flag column: name only, no flag.
    legacy = BoardColumn(id=gen_uuid(), board_id=board.id, name="Done", position=0)
    db_session.add(legacy)
    await db_session.commit()

    col_id = await _get_column_id_by_role(board.id, "done", db_session, fallback_name="Done")
    assert col_id == legacy.id


@pytest.mark.anyio
async def test_get_column_id_by_role_returns_none_when_missing(db_session):
    """No flag and no fallback name → None (orchestrator should noop)."""
    from src.app.orchestrator.runner import _get_column_id_by_role

    org = Organization(id=gen_uuid(), name="Empty Org", slug=gen_uuid()[:8])
    db_session.add(org)
    await db_session.flush()
    team = Team(id=gen_uuid(), org_id=org.id, name="Empty Team", slug=gen_uuid()[:8])
    db_session.add(team)
    await db_session.flush()
    user = User(id=gen_uuid(), email="empty@example.com", name="Empty User")
    db_session.add(user)
    await db_session.flush()
    project = Session(id=gen_uuid(), name="Empty Session", org_id=org.id, team_id=team.id, owner_id=user.id)
    db_session.add(project)
    await db_session.flush()
    board = Board(id=gen_uuid(), session_id=project.id, org_id=org.id)
    db_session.add(board)
    await db_session.commit()

    col_id = await _get_column_id_by_role(board.id, "done", db_session, fallback_name="Done")
    assert col_id is None
