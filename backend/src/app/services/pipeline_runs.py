"""Active pipeline run registry — supports cancellation across messages.

A "run" is one invocation of `_extract_diagram_inline_inner` (the wireframe
pipeline). Each session can have at most one **main** run plus any number of
**additive** / **edit** runs in flight at the same time.

When the user shifts direction mid-stream ("actually, mobile not desktop"),
the intent classifier emits route="cancel". The router then calls
`cancel_main_runs(session_id)` which `.cancel()`s the existing main task,
awaits its termination, and only then starts the new pipeline. The cancelled
task surfaces a `CancelledError` from inside its Anthropic stream and unwinds
cleanly — no further tokens spent.

Additive runs (route="add") and edit runs (route="edit") are NEVER cancelled
on direction shift, so a "tweak this one screen" or "also add a billing page"
keeps running while the main wireframe regen is being torn down.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)


RunKind = Literal["main", "additive", "edit"]


@dataclass
class ActiveRun:
    task: asyncio.Task
    run_id: str
    kind: RunKind


# session_id -> list of in-flight runs (any kind)
_active_runs: dict[str, list[ActiveRun]] = {}

# session_id -> monotonic time the most recent classification asked for a
# pipeline (any kind). Closes the race where a follow-up message classifies
# *before* the prior message's facilitator+pipeline have registered. We
# count "intended pipeline" as just-as-real as a registered one for the
# 30-second window, so the classifier sees `has_active_pipeline=True` and
# stops applying the empty-canvas rule.
_pending_starts: dict[str, float] = {}
_PENDING_TTL_S: float = 30.0


def mark_pending_pipeline(session_id: str) -> None:
    import time as _time
    _pending_starts[session_id] = _time.monotonic()


def has_pending_pipeline(session_id: str) -> bool:
    import time as _time
    started = _pending_starts.get(session_id)
    if started is None:
        return False
    if _time.monotonic() - started > _PENDING_TTL_S:
        _pending_starts.pop(session_id, None)
        return False
    return True


def clear_pending_pipeline(session_id: str) -> None:
    _pending_starts.pop(session_id, None)


def register_run(session_id: str, task: asyncio.Task, run_id: str, kind: RunKind) -> ActiveRun:
    """Add a run to the registry. The task is expected to call `unregister_run`
    in its `finally` block (success or cancellation)."""
    entry = ActiveRun(task=task, run_id=run_id, kind=kind)
    _active_runs.setdefault(session_id, []).append(entry)
    logger.info(
        "[RUNS] register session=%s run=%s kind=%s in_flight=%d",
        session_id, run_id, kind, len(_active_runs[session_id]),
    )
    return entry


def unregister_run(session_id: str, run_id: str) -> None:
    runs = _active_runs.get(session_id)
    if not runs:
        return
    _active_runs[session_id] = [r for r in runs if r.run_id != run_id]
    if not _active_runs[session_id]:
        _active_runs.pop(session_id, None)


def get_active_runs(session_id: str) -> list[ActiveRun]:
    return list(_active_runs.get(session_id, []))


def get_main_run(session_id: str) -> ActiveRun | None:
    for r in _active_runs.get(session_id, []):
        if r.kind == "main":
            return r
    return None


async def cancel_main_runs(session_id: str, *, reason: str = "scope_shift") -> list[str]:
    """Cancel every in-flight `main` run for this session and wait for each
    task to finish unwinding. Returns the list of cancelled run_ids so the
    caller can broadcast `pipeline_cancelled` events with the right ids."""
    runs = list(_active_runs.get(session_id, []))
    cancelled: list[str] = []
    for r in runs:
        if r.kind != "main":
            continue
        if r.task.done():
            continue
        logger.info(
            "[RUNS] cancel session=%s run=%s reason=%s", session_id, r.run_id, reason,
        )
        r.task.cancel()
        cancelled.append(r.run_id)
    # Wait for the cancellations to settle so the next pipeline doesn't
    # race against the dying task's WS broadcasts.
    for r in runs:
        if r.kind != "main":
            continue
        try:
            await r.task
        except asyncio.CancelledError:
            pass
        except Exception:
            # The pipeline already logs its own errors; swallow here so a
            # single failed task doesn't stop us from cancelling its peers.
            logger.exception("[RUNS] cancelled task raised non-CancelledError")
    return cancelled
