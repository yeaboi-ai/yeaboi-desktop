"""Orchestrator — picks up kanban cards and drives them through the dev pipeline via GitHub.

Supports wave-based parallel execution: cards with satisfied dependencies run concurrently.
"""

import asyncio
import logging
import time
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session_factory
from ..models.board import Board, BoardColumn, Card
from ..models.session import Session
from ..services.html_text import ac_done, ac_text, html_to_text
from ..services.slack_dispatcher import dispatch_event
from .agent_runner import run_agent
from .prompt_assembler import assemble_prompt
from .workspace import (
    commit_files,
    create_branch,
    get_file_content,
    get_repo_tree,
    open_pull_request,
)

logger = logging.getLogger(__name__)

_running_orchestrators: dict[str, bool] = {}


async def start_orchestrator(session_id: str) -> None:
    """Start the orchestrator polling loop for a project."""
    if _running_orchestrators.get(session_id):
        logger.info("Orchestrator already running for %s", session_id)
        return

    from ..metrics import ORCHESTRATOR_ACTIVE

    _running_orchestrators[session_id] = True
    ORCHESTRATOR_ACTIVE.inc()
    logger.info("Starting orchestrator for project %s", session_id)

    try:
        while _running_orchestrators.get(session_id):
            await _poll_and_dispatch(session_id)
            await asyncio.sleep(10)
    finally:
        _running_orchestrators[session_id] = False
        ORCHESTRATOR_ACTIVE.dec()


def stop_orchestrator(session_id: str) -> None:
    _running_orchestrators[session_id] = False


def is_running(session_id: str) -> bool:
    return _running_orchestrators.get(session_id, False)


async def _get_repo_url(session_id: str, db: AsyncSession) -> str | None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    project = result.scalar_one_or_none()
    return project.repo_url if project else None


async def _get_column_id(board_id: str, column_name: str, db: AsyncSession) -> str | None:
    """Find a column by name (legacy fallback, used when no role flag matches)."""
    result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board_id, BoardColumn.name == column_name)
    )
    col = result.scalar_one_or_none()
    return col.id if col else None


async def _get_column_id_by_role(
    board_id: str,
    role: str,
    db: AsyncSession,
    fallback_name: str | None = None,
) -> str | None:
    """Look up a column by lifecycle role flag, falling back to a hardcoded name.

    `role` is one of 'start', 'trigger', 'review', 'done'. Falls back to a
    case-insensitive name match when no column has the flag set so freshly
    upgraded boards keep working — emits a warning so we can monitor stragglers
    until the fallback is removed in a later release.
    """
    role_to_col = {
        "start": BoardColumn.is_start_state,
        "trigger": BoardColumn.agent_trigger_state,
        "review": BoardColumn.agent_review_state,
        "done": BoardColumn.is_done_state,
    }
    flag = role_to_col.get(role)
    if flag is not None:
        result = await db.execute(
            select(BoardColumn).where(BoardColumn.board_id == board_id, flag.is_(True)).order_by(BoardColumn.position)
        )
        col = result.scalars().first()
        if col:
            return col.id

    if fallback_name:
        col_id = await _get_column_id(board_id, fallback_name, db)
        if col_id:
            logger.warning(
                "Orchestrator falling back to name lookup for role '%s' on board %s "
                "(no column has the flag set). Set the flag in board settings to silence this.",
                role,
                board_id,
            )
            return col_id
    return None


async def _move_card_to_role(
    card: Card,
    board_id: str,
    role: str,
    fallback_name: str,
    db: AsyncSession,
) -> None:
    col_id = await _get_column_id_by_role(board_id, role, db, fallback_name=fallback_name)
    if col_id and card.column_id != col_id:
        card.column_id = col_id
        logger.info("Moved card '%s' to %s column", card.title, role)


async def _move_card_to_column(card: Card, board_id: str, column_name: str, db: AsyncSession) -> None:
    """Legacy name-based move kept for callers we haven't migrated yet."""
    col_id = await _get_column_id(board_id, column_name, db)
    if col_id and card.column_id != col_id:
        card.column_id = col_id
        logger.info("Moved card '%s' to column '%s'", card.title, column_name)


def _log(card: Card, message: str, output: str = "") -> None:
    entry = {"timestamp": datetime.now(UTC).isoformat(), "message": message}
    if output:
        entry["output"] = output[:1000]
    card.agent_log = [*(card.agent_log or []), entry]


async def _poll_and_dispatch(session_id: str) -> None:
    """Find all ready cards and process them in parallel (wave-based)."""
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(Board).where(Board.session_id == session_id))
        board = result.scalar_one_or_none()
        if not board:
            return

        repo_url = await _get_repo_url(session_id, db)
        if not repo_url:
            return

        backlog_col_id = await _get_column_id_by_role(board.id, "start", db, fallback_name="Backlog")
        todo_col_id = await _get_column_id_by_role(board.id, "trigger", db, fallback_name="To Do")
        if not todo_col_id:
            return

        # Get done card IDs for dependency resolution
        done_col_id = await _get_column_id_by_role(board.id, "done", db, fallback_name="Done")
        done_ids: set[str] = set()
        if done_col_id:
            done_cards_result = await db.execute(select(Card.id).where(Card.column_id == done_col_id))
            done_ids = set(done_cards_result.scalars().all())

        # Auto-reset stalled cards (stuck in non-terminal state for 5+ min)
        stall_threshold = datetime.now(UTC).replace(tzinfo=None) - __import__("datetime").timedelta(minutes=5)
        col_ids_all = [c for c in [backlog_col_id, todo_col_id, done_col_id] if c]
        # The "In Progress" column has no lifecycle flag — it's just whatever sits
        # between trigger and review. Looking it up by name is fine here since the
        # set is only used to scope stall detection.
        ip_col_id = await _get_column_id(board.id, "In Progress", db)
        review_col_id = await _get_column_id_by_role(board.id, "review", db, fallback_name="Review")
        if ip_col_id:
            col_ids_all.append(ip_col_id)
        if review_col_id:
            col_ids_all.append(review_col_id)

        stalled_result = await db.execute(
            select(Card).where(
                Card.column_id.in_(col_ids_all),
                Card.agent_status.in_(["investigating", "implementing", "reviewing"]),
                Card.updated_at < stall_threshold,
            )
        )
        stalled = list(stalled_result.scalars().all())
        if stalled:
            for card in stalled:
                stalled_stage = card.agent_status
                logger.info("Auto-retrying stalled card: %s (was %s)", card.title, stalled_stage)
                _log(card, f"Auto-retry: was {stalled_stage}, resetting to pending")
                # Store what stage we were at so _process_card can resume
                card.agent_log = [
                    *(card.agent_log or []),
                    {
                        "timestamp": datetime.now(UTC).isoformat(),
                        "message": f"Retrying from {stalled_stage}",
                        "retry_from": stalled_stage,
                    },
                ]
                # Reset to None so _poll_and_dispatch picks it up
                card.agent_status = None
                # Move back to To Do
                if card.column_id != todo_col_id:
                    card.column_id = todo_col_id
                # Don't clear branch — code may already be committed
            await db.commit()

        # Also include cards with agent_status "done" or "pr_open"
        done_status_result = await db.execute(select(Card.id).where(Card.agent_status.in_(["done", "pr_open"])))
        done_ids.update(done_status_result.scalars().all())

        # Get cards from both Backlog and To Do that have no agent_status
        search_cols = [todo_col_id]
        if backlog_col_id:
            search_cols.append(backlog_col_id)

        result = await db.execute(
            select(Card).where(Card.column_id.in_(search_cols), Card.agent_status.is_(None)).order_by(Card.position)
        )
        pending_cards = list(result.scalars().all())
        # Cards imported from a yeaboi plan carry a yeaboi_story_id and are
        # executed by yeaboi's own Ship engine (worktree + diff gate on the
        # user's machine) — this orchestrator must never claim them. Filtered
        # in Python because custom_fields is a JSON column and the set here is
        # small.
        pending_cards = [c for c in pending_cards if not (c.custom_fields or {}).get("yeaboi_story_id")]
        if not pending_cards:
            return

        # Find cards ready to run (all deps satisfied)
        ready = []
        for card in pending_cards:
            deps = card.depends_on or []
            if not deps or all(dep_id in done_ids for dep_id in deps):
                # Auto-move from Backlog → To Do
                if card.column_id == backlog_col_id:
                    card.column_id = todo_col_id
                    logger.info("Auto-moved '%s' from Backlog → To Do (deps satisfied)", card.title)
                ready.append(card)

        if ready:
            await db.commit()  # persist any Backlog → To Do moves

        if not ready:
            logger.info("No cards ready — all have unsatisfied dependencies")
            return

        # Limit concurrency to 3 cards at a time to avoid API rate limits
        MAX_CONCURRENT = 3
        logger.info("Wave: %d cards ready, processing %d at a time", len(ready), MAX_CONCURRENT)

        sem = asyncio.Semaphore(MAX_CONCURRENT)

        async def _limited(card_id: str) -> None:
            async with sem:
                await _process_card_standalone(card_id, board.id, repo_url, session_id)

        tasks = [_limited(card.id) for card in ready]
        await asyncio.gather(*tasks, return_exceptions=True)


async def _process_card_standalone(card_id: str, board_id: str, repo_url: str, session_id: str) -> None:
    """Process a single card with its own DB session (for parallel execution)."""
    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(Card).where(Card.id == card_id))
        card = result.scalar_one_or_none()
        if not card:
            return
        try:
            card_start = time.perf_counter()
            logger.info("Picking up card: %s", card.title)
            await _process_card(card, board_id, repo_url, db)
            total_ms = (time.perf_counter() - card_start) * 1000
            logger.info("Card '%s' completed in %.0fms", card.title, total_ms)

            from ..metrics import ORCHESTRATOR_CARDS

            ORCHESTRATOR_CARDS.labels(status="completed").inc()
        except Exception as e:
            from ..metrics import ORCHESTRATOR_CARDS

            ORCHESTRATOR_CARDS.labels(status="failed").inc()
            logger.error("Card %s failed: %s", card.title, e, exc_info=True)
            card.agent_status = "failed"
            _log(card, f"Processing failed: {e}")

            # Notify project owner of failure
            try:
                from ..services.notification_service import notify

                board_result = await db.execute(select(Board).where(Board.id == board_id))
                board_obj = board_result.scalar_one()
                project_result = await db.execute(select(Session).where(Session.id == board_obj.session_id))
                project_obj = project_result.scalar_one()
                await notify(
                    user_id=project_obj.owner_id,
                    title=f"Task failed: {card.title}",
                    body="AI agent encountered an error. Check the orchestrator for details.",
                    type="card_failed",
                    link=f"/sessions/{project_obj.id}/orchestrator",
                    session_id=project_obj.id,
                    db=db,
                )
                await dispatch_event(
                    db,
                    event_type="card_failed",
                    team_id=project_obj.team_id,
                    payload={
                        "card_id": card.id,
                        "card_title": card.title,
                        "session_id": project_obj.id,
                        "error": "AI agent encountered an error. Check the orchestrator for details.",
                    },
                )
            except Exception as notify_err:
                logger.warning("Failed to create failure notification: %s", notify_err)

            await db.commit()


async def _process_card(card: Card, board_id: str, repo_url: str, db: AsyncSession) -> None:
    from ..tracing import tracer

    branch_name = f"agent/{card.id[:8]}"

    # Look up project from board for notifications
    board_result = await db.execute(select(Board).where(Board.id == board_id))
    board_obj = board_result.scalar_one()
    project_result = await db.execute(select(Session).where(Session.id == board_obj.session_id))
    project_obj = project_result.scalar_one()

    # Detect if this is a retry — check if branch already exists
    has_branch = card.agent_branch is not None
    # Check last log for retry info
    last_logs = card.agent_log or []
    retry_from = None
    for log_entry in reversed(last_logs):
        if isinstance(log_entry, dict) and log_entry.get("retry_from"):
            retry_from = log_entry["retry_from"]
            break

    # Skip stages based on what's already done
    skip_investigate = has_branch or retry_from in ("implementing", "reviewing")
    skip_implement = has_branch and retry_from == "reviewing"

    repo_tree = get_repo_tree(repo_url)
    agents_md = get_file_content(repo_url, "AGENTS.md") or ""
    result: dict = {"success": True, "output": "", "files": {}, "error": None}

    # Stage 1: Investigating (skip if resuming from later stage)
    if not skip_investigate:
        stage_start = time.perf_counter()
        card.agent_status = "investigating"
        _log(card, "Starting investigation")
        await db.commit()

        investigate_prompt = assemble_prompt(
            card.title, html_to_text(card.description) or "", "investigating", agents_md
        )
        investigate_prompt += f"\n\nRepo structure:\n{repo_tree}"

        with tracer.start_as_current_span("orchestrator.investigating", attributes={"card.title": card.title}):
            result = await run_agent(investigate_prompt, repo_context=repo_tree, model="haiku")

        if not result["success"]:
            card.agent_status = "failed"
            _log(card, f"Investigation failed: {result['error']}")
            await db.commit()
            return

        stage_s = time.perf_counter() - stage_start
        logger.info("Card '%s' stage 'investigating' completed in %.0fms", card.title, stage_s * 1000)

        from ..metrics import ORCHESTRATOR_STAGE_LATENCY

        ORCHESTRATOR_STAGE_LATENCY.labels(stage="investigating").observe(stage_s)
        _log(card, "Investigation complete", result["output"][:500])
        await db.commit()
    else:
        _log(card, "Resuming — skipping investigation")

    # Stage 2: Implementing (skip if resuming from review)
    if not skip_implement:
        stage_start = time.perf_counter()
        card.agent_status = "implementing"
        _log(card, "Starting implementation")
        # "In Progress" has no role flag; legacy name lookup is intentional.
        await _move_card_to_column(card, board_id, "In Progress", db)
        await db.commit()

        description_text = html_to_text(card.description) or ""
        implement_prompt = assemble_prompt(card.title, description_text, "implementing", agents_md)
        ac_lines = [f"- [{'x' if ac_done(ac) else ' '}] {ac_text(ac)}" for ac in (card.acceptance_criteria or [])]
        implement_prompt += (
            f"\n\nInvestigation findings:\n{result['output'][:2000]}"
            f"\n\nRepo structure:\n{repo_tree}"
            f"\n\nAcceptance criteria:\n" + "\n".join(ac_lines)
        )

        with tracer.start_as_current_span("orchestrator.implementing", attributes={"card.title": card.title}):
            result = await run_agent(implement_prompt, repo_context=repo_tree)

        if not result["success"] or not result["files"]:
            card.agent_status = "failed"
            _log(card, f"Implementation failed: {result.get('error', 'No files generated')}")
            await db.commit()
            return

        stage_s = time.perf_counter() - stage_start
        logger.info("Card '%s' stage 'implementing' completed in %.0fms", card.title, stage_s * 1000)

        from ..metrics import ORCHESTRATOR_STAGE_LATENCY

        ORCHESTRATOR_STAGE_LATENCY.labels(stage="implementing").observe(stage_s)
        _log(card, f"Implementation complete — {len(result['files'])} files generated")

        try:
            create_branch(repo_url, branch_name)
            card.agent_branch = branch_name
            commit_files(repo_url, branch_name, result["files"], f"feat: {card.title}\n\nGenerated by AI orchestrator")
            _log(card, f"Code committed to branch {branch_name}")
        except Exception as e:
            # Branch might already exist from previous attempt
            if "already exists" in str(e).lower() or "Reference already exists" in str(e):
                _log(card, f"Branch {branch_name} already exists — committing to it")
                card.agent_branch = branch_name
                try:
                    commit_files(
                        repo_url, branch_name, result["files"], f"feat: {card.title}\n\nGenerated by AI orchestrator"
                    )
                except Exception as e2:
                    card.agent_status = "failed"
                    _log(card, f"Git commit failed: {e2}")
                    await db.commit()
                    return
            else:
                card.agent_status = "failed"
                _log(card, f"Git operations failed: {e}")
                await db.commit()
                return

        await db.commit()
    else:
        _log(card, "Resuming — skipping implementation (code already committed)")

    # Stage 3: Code Review (single pass, using Haiku for speed)
    stage_start = time.perf_counter()
    card.agent_status = "reviewing"
    _log(card, "Starting code review")
    await db.commit()

    review_prompt = (
        "Review these files for bugs, security issues, and missing error handling. "
        "If you find issues, output corrected files using ```file:path``` format. "
        "If the code looks good, just say 'LGTM'.\n\n"
    )
    for path, content in result["files"].items():
        review_prompt += f"\n--- {path} ---\n{content[:1500]}\n"

    with tracer.start_as_current_span("orchestrator.reviewing", attributes={"card.title": card.title}):
        review_result = await run_agent(review_prompt, model="haiku")

    if review_result["success"] and review_result["files"]:
        try:
            commit_files(repo_url, branch_name, review_result["files"], f"fix: review fixes for {card.title}")
            _log(card, f"Review: fixed {len(review_result['files'])} files")
        except Exception as e:
            _log(card, f"Failed to commit review fixes: {e}")
    elif review_result["success"]:
        _log(card, "Review: LGTM", review_result["output"][:300])
    else:
        _log(card, f"Review skipped: {review_result.get('error', 'unknown')}")

    stage_s = time.perf_counter() - stage_start
    logger.info("Card '%s' stage 'reviewing' completed in %.0fms", card.title, stage_s * 1000)

    from ..metrics import ORCHESTRATOR_STAGE_LATENCY

    ORCHESTRATOR_STAGE_LATENCY.labels(stage="reviewing").observe(stage_s)
    await db.commit()

    # Stage 4: Open PR
    card.agent_status = "pr_open"
    await _move_card_to_role(card, board_id, "review", "Review", db)

    try:
        pr_body = (
            f"## {card.title}\n\n"
            f"{html_to_text(card.description) or 'No description'}\n\n"
            f"### Acceptance Criteria\n"
            + "\n".join(f"- [{'x' if ac_done(ac) else ' '}] {ac_text(ac)}" for ac in (card.acceptance_criteria or []))
            + "\n\n---\n*Generated by AI Orchestrator*"
        )
        pr_url = open_pull_request(repo_url, branch_name, card.title, pr_body)
        card.agent_pr_url = pr_url
        _log(card, f"PR opened: {pr_url}")

        # Auto-approve cards that are flagged or low/medium priority
        if card.auto_approve or card.priority in ("low", "medium"):
            try:
                from .workspace import merge_pull_request as _merge_pr

                merged = _merge_pr(repo_url, pr_url)
                if merged:
                    card.agent_status = "done"
                    await _move_card_to_role(card, board_id, "done", "Done", db)
                    _log(card, f"Auto-approved and merged ({card.priority} priority)")

                    # Notify project owner of auto-approval
                    try:
                        from ..services.notification_service import notify

                        await notify(
                            user_id=project_obj.owner_id,
                            title=f"Auto-merged: {card.title}",
                            body=f"PR was auto-approved and merged ({card.priority} priority).",
                            type="card_auto_approved",
                            link=card.agent_pr_url,
                            session_id=project_obj.id,
                            db=db,
                        )
                        await dispatch_event(
                            db,
                            event_type="card_auto_approved",
                            team_id=project_obj.team_id,
                            payload={
                                "card_id": card.id,
                                "card_title": card.title,
                                "session_id": project_obj.id,
                                "pr_url": card.agent_pr_url,
                            },
                        )
                    except Exception as ne:
                        logger.warning("Failed to create auto-approve notification: %s", ne)
                else:
                    _log(card, "Auto-approve failed — PR not mergeable, waiting for human review")
                    # Notify project owner that PR needs manual review
                    try:
                        from ..services.notification_service import notify

                        await notify(
                            user_id=project_obj.owner_id,
                            title=f"PR ready: {card.title}",
                            body="AI completed implementation and opened a PR for review.",
                            type="pr_ready",
                            link=card.agent_pr_url,
                            session_id=project_obj.id,
                            db=db,
                        )
                        await dispatch_event(
                            db,
                            event_type="pr_ready",
                            team_id=project_obj.team_id,
                            payload={
                                "card_id": card.id,
                                "card_title": card.title,
                                "session_id": project_obj.id,
                                "pr_url": card.agent_pr_url,
                            },
                        )
                    except Exception as ne:
                        logger.warning("Failed to create notification: %s", ne)
            except Exception as e:
                _log(card, f"Auto-approve failed: {e} — waiting for human review")
                # Notify project owner that PR needs manual review
                try:
                    from ..services.notification_service import notify

                    await notify(
                        user_id=project_obj.owner_id,
                        title=f"PR ready: {card.title}",
                        body="AI completed implementation and opened a PR for review.",
                        type="pr_ready",
                        link=card.agent_pr_url,
                        session_id=project_obj.id,
                        db=db,
                    )
                    await dispatch_event(
                        db,
                        event_type="pr_ready",
                        team_id=project_obj.team_id,
                        payload={
                            "card_id": card.id,
                            "card_title": card.title,
                            "session_id": project_obj.id,
                            "pr_url": card.agent_pr_url,
                        },
                    )
                except Exception as ne:
                    logger.warning("Failed to create notification: %s", ne)
        else:
            # Notify project owner that PR is ready for manual review
            try:
                from ..services.notification_service import notify

                await notify(
                    user_id=project_obj.owner_id,
                    title=f"PR ready: {card.title}",
                    body="AI completed implementation and opened a PR for review.",
                    type="pr_ready",
                    link=card.agent_pr_url,
                    session_id=project_obj.id,
                    db=db,
                )
                await dispatch_event(
                    db,
                    event_type="pr_ready",
                    team_id=project_obj.team_id,
                    payload={
                        "card_id": card.id,
                        "card_title": card.title,
                        "session_id": project_obj.id,
                        "pr_url": card.agent_pr_url,
                    },
                )
            except Exception as e:
                logger.warning("Failed to create notification: %s", e)
    except Exception as e:
        _log(card, f"Failed to open PR: {e}")
        card.agent_status = "failed"

    await db.commit()
