"""Unit tests for the iterative hero refinement loop.

The loop is pure orchestration over two injected callables (critique_fn,
enrich_fn) so it runs with fakes — no real models, no rendering. These tests
pin the stop conditions, the validation guard, the monotonic-best guarantee,
and the degrade-to-draft failure paths.
"""

from __future__ import annotations

import pytest

from src.app.services.wireframe_refine import (
    Critique,
    Gap,
    _is_valid_enrichment,
    run_refinement,
)

# A non-trivial draft with class anchors the guard can check.
DRAFT = (
    "<div class='shell'><header class='topbar'>App</header>"
    "<main class='content'><table class='ledger'><tr><td>row</td></tr></table>"
    "</main></div>"
)


def _critique(score, *areas):
    return Critique(score=score, gaps=[Gap(area=a, patch_instruction=f"do {a}", severity="high") for a in areas])


@pytest.mark.anyio
async def test_stops_when_score_meets_threshold_on_first_critique():
    async def critique_fn(_html):
        return _critique(90)

    async def enrich_fn(_html, _gaps):  # should never be called
        raise AssertionError("enrich must not run when draft already passes")

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    assert res.passes == 1
    assert res.final_score == 90
    assert res.html == DRAFT


@pytest.mark.anyio
async def test_stops_at_max_passes_when_threshold_never_reached():
    scores = iter([10, 20, 30, 40])  # one per critique; never >= 85

    async def critique_fn(_html):
        return _critique(next(scores), "density")

    async def enrich_fn(html, _gaps):
        return html + "<div class='added'>more</div>"

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    # draft(pass1) + 2 enrich rounds = 3 passes, 3 critiques consumed.
    assert res.passes == 3


@pytest.mark.anyio
async def test_returns_best_scoring_version_not_last():
    # scores go up then down — loop keeps going (latest < threshold) but the
    # returned html must be the highest-scoring one seen.
    scores = iter([50, 80, 60])
    htmls = []

    async def critique_fn(_html):
        return _critique(next(scores), "polish")

    async def enrich_fn(html, _gaps):
        nxt = html + f"<div class='v{len(htmls)}'>x</div>"
        htmls.append(nxt)
        return nxt

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    assert res.final_score == 80
    assert res.html == htmls[0]  # the version that scored 80


@pytest.mark.anyio
async def test_invalid_enrichment_retries_once_then_keeps_last_valid():
    calls = {"n": 0}

    async def critique_fn(_html):
        return _critique(10, "density")

    async def enrich_fn(_html, _gaps):
        calls["n"] += 1
        return "<p>tiny</p>"  # drastic shrink → always invalid

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    assert calls["n"] == 2  # one attempt + one retry, then break
    assert res.html == DRAFT  # kept the draft; never accepted the bad patch


@pytest.mark.anyio
async def test_malformed_first_critique_returns_draft():
    async def critique_fn(_html):
        return None  # parser failed

    async def enrich_fn(_html, _gaps):
        raise AssertionError("enrich must not run when critique is unavailable")

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    assert res.html == DRAFT
    assert res.passes == 1
    assert res.final_score is None


@pytest.mark.anyio
async def test_enrich_returning_none_stops_cleanly():
    async def critique_fn(_html):
        return _critique(10, "density")

    async def enrich_fn(_html, _gaps):
        return None  # generator failed

    res = await run_refinement(
        initial_html=DRAFT, critique_fn=critique_fn, enrich_fn=enrich_fn, threshold=85, max_passes=3
    )
    assert res.html == DRAFT


def test_validation_guard_rejects_shrink_and_lost_anchors_accepts_growth():
    old = DRAFT
    assert _is_valid_enrichment(old, old + "<div class='extra'>more rows</div>") is True
    assert _is_valid_enrichment(old, "<p>tiny</p>") is False  # drastic shrink
    assert _is_valid_enrichment(old, "") is False
    assert _is_valid_enrichment(old, "no tags here, plain text padded out to length" * 5) is False
    # same length but anchors stripped → rejected
    stripped = "<div class='zzz'>" + ("x" * len(old)) + "</div>"
    assert _is_valid_enrichment(old, stripped) is False


from src.app.services.wireframe_refine import (  # noqa: E402
    build_critic_prompt,
    build_enrich_prompt,
    parse_critique,
)


def test_parse_critique_well_formed():
    raw = (
        '{"score": 72, "gaps": ['
        '{"area": "data", "patch_instruction": "add named borrowers", "severity": "high"},'
        '{"area": "states", "patch_instruction": "add an overdue row", "severity": "low"}]}'
    )
    crit = parse_critique(raw)
    assert crit is not None
    assert crit.score == 72
    assert len(crit.gaps) == 2
    assert crit.gaps[0].area == "data"
    assert crit.gaps[0].severity == "high"


def test_parse_critique_tolerates_code_fence_and_prose():
    raw = 'Here is my review:\n```json\n{"score": 88, "gaps": []}\n```\nLooks strong.'
    crit = parse_critique(raw)
    assert crit is not None
    assert crit.score == 88
    assert crit.gaps == []


def test_parse_critique_malformed_returns_none():
    assert parse_critique("not json at all") is None
    assert parse_critique("") is None
    assert parse_critique('{"score": "high"}') is None  # non-int score


def test_build_prompts_include_html_and_rubric():
    cp = build_critic_prompt("<div class='x'>hi</div>")
    assert "<div class='x'>hi</div>" in cp
    assert "score" in cp.lower()
    ep = build_enrich_prompt("<div>old</div>", [Gap("data", "add real names", "high")])
    assert "<div>old</div>" in ep
    assert "add real names" in ep
