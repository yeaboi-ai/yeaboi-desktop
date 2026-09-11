"""Tests for the per-execution-wave background task generator."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.app.models.task_generation_job import TaskGenerationJob
from src.app.services.task_generator_waves import (
    MAX_WAVES,
    _parse_wave_response,
    _validate_wave_output,
    run_wave_generation,
)

# ── _parse_wave_response unit tests ─────────────────────────────────────────


def test_parse_wave_response_wrapped_object():
    raw = json.dumps({"tasks": [{"title": "A"}], "complete": True})
    tasks, complete = _parse_wave_response(raw)
    assert tasks == [{"title": "A"}]
    assert complete is True


def test_parse_wave_response_complete_defaults_false_when_missing():
    raw = json.dumps({"tasks": [{"title": "A"}]})
    tasks, complete = _parse_wave_response(raw)
    assert tasks == [{"title": "A"}]
    assert complete is False


def test_parse_wave_response_bare_list_treated_not_complete():
    """If the model forgets the wrapping object and returns a bare list, the
    parser accepts it and assumes the loop should continue."""
    raw = json.dumps([{"title": "A"}])
    tasks, complete = _parse_wave_response(raw)
    assert tasks == [{"title": "A"}]
    assert complete is False


def test_parse_wave_response_strips_markdown_fences():
    raw = "```json\n" + json.dumps({"tasks": [{"title": "A"}], "complete": False}) + "\n```"
    tasks, complete = _parse_wave_response(raw)
    assert tasks == [{"title": "A"}]
    assert complete is False


def test_parse_wave_response_invalid_json_returns_empty():
    tasks, complete = _parse_wave_response("not json at all")
    assert tasks == []
    assert complete is False


def test_parse_wave_response_tasks_not_list_returns_empty():
    raw = json.dumps({"tasks": "oops", "complete": False})
    tasks, complete = _parse_wave_response(raw)
    assert tasks == []
    assert complete is False


# ── _validate_wave_output unit tests ────────────────────────────────────────


def test_validate_wave_zero_drops_all_depends_on():
    """Wave 0 has prev_count=0 — any depends_on_indices is invalid."""
    new_tasks = [
        {"title": "A", "depends_on_indices": [], "related_to_indices": []},
        {"title": "B", "depends_on_indices": [0], "related_to_indices": [0]},  # invalid
    ]
    cleaned = _validate_wave_output(new_tasks, prev_count=0, wave_idx=0)
    assert len(cleaned) == 2
    assert cleaned[1]["depends_on_indices"] == []
    assert cleaned[1]["related_to_indices"] == []


def test_validate_wave_n_drops_forward_refs():
    """Wave N with prev_count=3 — deps in 0..2 are valid, 3+ are dropped."""
    new_tasks = [
        {"title": "C", "depends_on_indices": [0, 1, 5, 99]},
    ]
    cleaned = _validate_wave_output(new_tasks, prev_count=3, wave_idx=1)
    assert cleaned[0]["depends_on_indices"] == [0, 1]


def test_validate_wave_n_keeps_valid_indices():
    new_tasks = [
        {"title": "D", "depends_on_indices": [2], "related_to_indices": [1]},
    ]
    cleaned = _validate_wave_output(new_tasks, prev_count=4, wave_idx=2)
    assert cleaned[0]["depends_on_indices"] == [2]
    assert cleaned[0]["related_to_indices"] == [1]


def test_validate_drops_non_dict_entries():
    new_tasks = [
        {"title": "ok", "depends_on_indices": [0]},
        "garbage",
        None,
        {"title": "also-ok", "depends_on_indices": []},
    ]
    cleaned = _validate_wave_output(new_tasks, prev_count=1, wave_idx=1)
    assert len(cleaned) == 2
    assert {c["title"] for c in cleaned} == {"ok", "also-ok"}


# ── run_wave_generation end-to-end with mocked AI ───────────────────────────


def _make_ai_with_responses(responses: list[dict]) -> AsyncMock:
    """Mock get_ai_client that returns successive wave responses.

    The wave generator uses ``ai.chat_stream(...)`` (an async generator that
    yields text chunks). We make a fresh async-generator factory per call so
    successive waves get successive payloads.
    """
    mock = AsyncMock()
    mock.provider = "test"
    iter_state = {"idx": 0}

    def chat_stream(**_kwargs):
        idx = iter_state["idx"]
        iter_state["idx"] += 1
        if idx >= len(responses):
            raise StopAsyncIteration
        payload = json.dumps(responses[idx])

        async def _gen():
            # Yield the whole payload as a single chunk — the wave parser
            # joins chunks before parsing JSON so chunk boundaries don't
            # matter.
            yield payload

        return _gen()

    mock.chat_stream = chat_stream
    # Expose a call count so tests can assert how many waves ran.
    mock.call_count = lambda: iter_state["idx"]
    return mock


@pytest.fixture
async def seeded_project_and_session(client, auth_headers):
    """Create a project + reviewing session with a non-empty blueprint."""
    proj = await client.post("/api/sessions", json={"name": "P-waves"}, headers=auth_headers)
    session_id = proj.json()["id"]
    await client.patch(
        f"/api/sessions/{session_id}/blueprint/sections/project_overview",
        json={"content": "A wave-driven kanban planner."},
        headers=auth_headers,
    )
    await client.patch(
        f"/api/sessions/{session_id}",
        json={"status": "reviewing"},
        headers=auth_headers,
    )
    return session_id


async def _make_job(db_session, session_id, org_id):
    job = TaskGenerationJob(
        session_id=session_id,
        org_id=org_id,
        status="pending",
        partial_tasks=[],
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


def _patch_factory(db_engine):
    """Return a session_factory bound to the test engine for the worker."""
    return async_sessionmaker(db_engine, expire_on_commit=False)

async def _make_job(db_session, session_id, org_id):
    job = TaskGenerationJob(
        session_id=session_id,
        org_id=org_id,
        status="pending",
        partial_tasks=[],
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job



async def test_worker_completes_after_first_wave_when_model_signals_complete(
    client, auth_headers, db_session, db_engine, seeded_project_and_session
):
    """If Wave 0 returns complete=true, the loop exits immediately."""
    session_id = seeded_project_and_session
    # Look up org_id via the project.
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = await _make_job(db_session, session_id, proj.org_id)

    wave_0 = {
        "tasks": [
            {"title": "Setup repo", "depends_on_indices": [], "related_to_indices": []},
            {"title": "Wire CI", "depends_on_indices": [], "related_to_indices": []},
        ],
        "complete": True,
    }
    ai = _make_ai_with_responses([wave_0])

    with (
        patch("src.app.services.task_generator_waves.get_ai_client", AsyncMock(return_value=ai)),
        patch("src.app.services.task_generator_waves.get_session_factory", return_value=_patch_factory(db_engine)),
    ):
        await run_wave_generation(job.id)

    # Re-fetch from a fresh session — the worker committed via its own factory.
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as fresh:
        final = (await fresh.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job.id))).scalar_one()
        assert final.status == "complete"
        assert len(final.partial_tasks) == 2
        assert final.partial_tasks[0]["wave"] == 0
        assert final.partial_tasks[1]["wave"] == 0
        assert ai.call_count() == 1


async def test_worker_chains_multiple_waves_until_complete(
    client, auth_headers, db_session, db_engine, seeded_project_and_session
):
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = await _make_job(db_session, session_id, proj.org_id)

    wave_0 = {"tasks": [{"title": "Setup", "depends_on_indices": []}], "complete": False}
    wave_1 = {"tasks": [{"title": "Auth", "depends_on_indices": [0]}], "complete": False}
    wave_2 = {"tasks": [{"title": "Release", "depends_on_indices": [1]}], "complete": True}

    ai = _make_ai_with_responses([wave_0, wave_1, wave_2])

    with (
        patch("src.app.services.task_generator_waves.get_ai_client", AsyncMock(return_value=ai)),
        patch("src.app.services.task_generator_waves.get_session_factory", return_value=_patch_factory(db_engine)),
    ):
        await run_wave_generation(job.id)

    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as fresh:
        final = (await fresh.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job.id))).scalar_one()
        assert final.status == "complete"
        assert [t["title"] for t in final.partial_tasks] == ["Setup", "Auth", "Release"]
        # Recomputed waves: Setup -> 0, Auth depends on 0 -> 1, Release on 1 -> 2.
        waves = [t["wave"] for t in final.partial_tasks]
        assert waves == [0, 1, 2]
        assert ai.call_count() == 3


async def test_worker_hits_max_waves_cap(client, auth_headers, db_session, db_engine, seeded_project_and_session):
    """If the model never signals complete, the loop stops at MAX_WAVES."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = await _make_job(db_session, session_id, proj.org_id)

    wave_0 = {"tasks": [{"title": "T0", "depends_on_indices": []}], "complete": False}
    wave_n = {"tasks": [{"title": "TN", "depends_on_indices": [0]}], "complete": False}
    responses = [wave_0] + [wave_n] * (MAX_WAVES - 1)
    ai = _make_ai_with_responses(responses)

    with (
        patch("src.app.services.task_generator_waves.get_ai_client", AsyncMock(return_value=ai)),
        patch("src.app.services.task_generator_waves.get_session_factory", return_value=_patch_factory(db_engine)),
    ):
        await run_wave_generation(job.id)

    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as fresh:
        final = (await fresh.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job.id))).scalar_one()
        assert final.status == "complete"
        assert final.waves_complete == MAX_WAVES
        assert ai.call_count() == MAX_WAVES


async def test_worker_marks_failed_on_ai_exception(
    client, auth_headers, db_session, db_engine, seeded_project_and_session
):
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = await _make_job(db_session, session_id, proj.org_id)

    ai = AsyncMock()
    ai.provider = "test"

    def _raising_stream(**_kwargs):
        async def _gen():
            raise RuntimeError("upstream boom")
            yield  # pragma: no cover - unreachable, makes this an async generator

        return _gen()

    ai.chat_stream = _raising_stream

    with (
        patch("src.app.services.task_generator_waves.get_ai_client", AsyncMock(return_value=ai)),
        patch("src.app.services.task_generator_waves.get_session_factory", return_value=_patch_factory(db_engine)),
    ):
        await run_wave_generation(job.id)

    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as fresh:
        final = (await fresh.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job.id))).scalar_one()
        assert final.status == "failed"
        assert "upstream boom" in (final.error or "")


async def test_worker_empty_wave_terminates_cleanly(
    client, auth_headers, db_session, db_engine, seeded_project_and_session
):
    """An empty tasks list with complete=False should still end the loop —
    we don't want to spin forever asking the model for more."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = await _make_job(db_session, session_id, proj.org_id)

    wave_0 = {"tasks": [{"title": "Setup", "depends_on_indices": []}], "complete": False}
    wave_1_empty = {"tasks": [], "complete": False}
    ai = _make_ai_with_responses([wave_0, wave_1_empty])

    with (
        patch("src.app.services.task_generator_waves.get_ai_client", AsyncMock(return_value=ai)),
        patch("src.app.services.task_generator_waves.get_session_factory", return_value=_patch_factory(db_engine)),
    ):
        await run_wave_generation(job.id)

    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as fresh:
        final = (await fresh.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job.id))).scalar_one()
        assert final.status == "complete"
        assert len(final.partial_tasks) == 1


# ── Endpoint integration tests ──────────────────────────────────────────────


async def test_preview_async_returns_job_id(client, auth_headers, seeded_project_and_session):
    session_id = seeded_project_and_session

    # The route fires a BackgroundTask that uses its own session factory
    # (pointing at the real engine, not the test engine). We're only testing
    # the route response shape here, so stub the worker entry point to a no-op.
    async def _noop(job_id: str) -> None:
        return None

    with patch(
        "src.app.services.task_generator_waves.run_wave_generation",
        new=_noop,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data and isinstance(data["job_id"], str)


async def test_preview_async_rejects_empty_blueprint(client, auth_headers):
    proj = await client.post("/api/sessions", json={"name": "P-empty"}, headers=auth_headers)
    session_id = proj.json()["id"]
    # No blueprint patch — blueprint stays empty.
    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview-async",
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_get_job_status_404_for_unknown(client, auth_headers):
    resp = await client.get("/api/jobs/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404


async def test_cancel_endpoint_flips_status(client, auth_headers, db_session, seeded_project_and_session):
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    job = TaskGenerationJob(
        session_id=session_id,
        org_id=proj.org_id,
        status="running",
        partial_tasks=[],
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    resp = await client.post(f"/api/jobs/{job.id}/cancel", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


async def test_preview_async_is_idempotent_for_same_session(
    client, auth_headers, db_session, seeded_project_and_session
):
    """A second preview-async on the same session reuses the in-flight job."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    # Pre-create a running job so the second call sees it.
    job = TaskGenerationJob(
        session_id=session_id,
        org_id=proj.org_id,
        status="running",
        partial_tasks=[],
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview-async",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["job_id"] == job.id


# ── Style picker integration (two axes: granularity + modifiers) ───────────


async def test_preview_async_rejects_unknown_granularity(client, auth_headers, seeded_project_and_session):
    session_id = seeded_project_and_session
    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview-async",
        json={"granularity": "not_a_thing"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "not_a_thing" in (resp.json().get("detail") or "")


async def test_preview_async_rejects_unknown_modifier(client, auth_headers, seeded_project_and_session):
    session_id = seeded_project_and_session
    resp = await client.post(
        f"/api/sessions/{session_id}/stories/preview-async",
        json={"modifiers": ["spike_first", "not_a_modifier"]},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "not_a_modifier" in (resp.json().get("detail") or "")


async def test_preview_async_stamps_granularity_and_modifiers_on_job(
    client, auth_headers, db_session, seeded_project_and_session
):
    """The body's granularity + modifiers both land on the job for the worker."""
    session_id = seeded_project_and_session

    async def _noop(job_id: str) -> None:
        return None

    with patch(
        "src.app.services.task_generator_waves.run_wave_generation",
        new=_noop,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            json={"granularity": "many_small", "modifiers": ["spike_first", "story_driven"]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = (
        await db_session.execute(
            select(TaskGenerationJob).where(TaskGenerationJob.id == job_id)
        )
    ).scalar_one()
    assert job.style == "many_small"
    assert sorted(job.modifiers) == sorted(["spike_first", "story_driven"])


async def test_preview_async_legacy_style_field_reroutes_modifier(
    client, auth_headers, db_session, seeded_project_and_session
):
    """Older clients sending the legacy single-axis ``style`` field must keep
    working — a modifier slug there gets routed into the modifiers list, and
    granularity stays at the default."""
    session_id = seeded_project_and_session

    async def _noop(job_id: str) -> None:
        return None

    with patch(
        "src.app.services.task_generator_waves.run_wave_generation",
        new=_noop,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            json={"style": "vertical_slices"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = (
        await db_session.execute(
            select(TaskGenerationJob).where(TaskGenerationJob.id == job_id)
        )
    ).scalar_one()
    assert job.style == "balanced"
    assert job.modifiers == ["vertical_slices"]


async def test_preview_async_uses_project_defaults_when_body_empty(
    client, auth_headers, db_session, seeded_project_and_session
):
    """No `granularity` / `modifiers` in the body → fall back to project defaults."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    proj.default_generation_style = "minimal"
    proj.default_modifiers = ["wave_optimised"]
    await db_session.commit()

    async def _noop(job_id: str) -> None:
        return None

    with patch(
        "src.app.services.task_generator_waves.run_wave_generation",
        new=_noop,
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            headers=auth_headers,
        )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = (
        await db_session.execute(
            select(TaskGenerationJob).where(TaskGenerationJob.id == job_id)
        )
    ).scalar_one()
    assert job.style == "minimal"
    assert job.modifiers == ["wave_optimised"]


async def test_preview_async_follow_practices_modifier_drops_on_failure(
    client, auth_headers, db_session, seeded_project_and_session
):
    """When ``follow_practices`` is requested as a modifier and the repo analyzer
    raises, the route returns a warning and dispatches the job WITHOUT that
    modifier — other modifiers + granularity still apply."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session
    from src.app.services.repo_conventions_analyzer import RepoAnalysisError

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    proj.repo_url = "https://github.com/acme/widget"
    await db_session.commit()

    async def _raise(*a, **kw):
        raise RepoAnalysisError("Simulated GitHub failure")

    async def _noop(job_id: str) -> None:
        return None

    with (
        patch(
            "src.app.services.repo_conventions_analyzer.ensure_repo_profile",
            side_effect=_raise,
        ),
        patch(
            "src.app.services.task_generator_waves.run_wave_generation",
            new=_noop,
        ),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            json={
                "granularity": "many_small",
                "modifiers": ["spike_first", "follow_practices"],
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "warning" in data and "follow-practices" in data["warning"]
    job = (
        await db_session.execute(
            select(TaskGenerationJob).where(TaskGenerationJob.id == data["job_id"])
        )
    ).scalar_one()
    assert job.style == "many_small"
    assert job.modifiers == ["spike_first"]  # follow_practices dropped
    assert job.repo_profile_json is None


async def test_preview_async_follow_practices_modifier_stashes_profile_on_success(
    client, auth_headers, db_session, seeded_project_and_session
):
    """Successful repo analysis → the profile snapshot lands on the job and
    follow_practices stays in the modifiers list."""
    session_id = seeded_project_and_session
    from src.app.models.session import Session

    proj = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    proj.repo_url = "https://github.com/acme/widget"
    await db_session.commit()

    fake_profile = {"summary_sentence": "All small tickets.", "title_format": "imperative"}

    async def _noop(job_id: str) -> None:
        return None

    with (
        patch(
            "src.app.services.repo_conventions_analyzer.ensure_repo_profile",
            AsyncMock(return_value=fake_profile),
        ),
        patch(
            "src.app.services.task_generator_waves.run_wave_generation",
            new=_noop,
        ),
    ):
        resp = await client.post(
            f"/api/sessions/{session_id}/stories/preview-async",
            json={"granularity": "balanced", "modifiers": ["follow_practices"]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = (
        await db_session.execute(
            select(TaskGenerationJob).where(TaskGenerationJob.id == job_id)
        )
    ).scalar_one()
    assert job.style == "balanced"
    assert job.modifiers == ["follow_practices"]
    assert job.repo_profile_json == fake_profile
