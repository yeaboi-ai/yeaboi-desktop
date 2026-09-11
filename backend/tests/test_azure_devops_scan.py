"""Tests for the Azure DevOps scan connector."""

from src.app.services.connectors.azure_devops_scan import (
    _build_pipelines_prompt,
    _build_repo_prompt,
    _build_wiki_page_classifier_prompt,
    _parse_classifier_output,
    _slugify,
)

# ---------------------------------------------------------------------------
# _slugify
# ---------------------------------------------------------------------------


def test_slugify_basic():
    assert _slugify("Planning API") == "planning-api"
    assert _slugify("Hello   World!") == "hello-world"


def test_slugify_non_ascii():
    assert _slugify("Café / Wörld") == "caf-w-rld"


def test_slugify_empty():
    assert _slugify("") == "untitled"
    assert _slugify("!!!") == "untitled"


def test_slugify_trims_long():
    long_title = "x" * 200
    result = _slugify(long_title)
    assert len(result) <= 80


# ---------------------------------------------------------------------------
# _build_repo_prompt
# ---------------------------------------------------------------------------


def test_build_repo_prompt_minimal():
    prompt = _build_repo_prompt("planning-api", "main", [])
    assert "planning-api" in prompt
    assert "main" in prompt


def test_build_repo_prompt_with_readme_and_manifest():
    commits = [{"comment": "feat: add health endpoint", "author": {"name": "alice"}}]
    prompt = _build_repo_prompt(
        "planning-api", "main", commits,
        readme="# Planning API\nFastAPI backend.",
        manifest='{"name":"planning-api"}',
        manifest_name="package.json",
    )
    assert "FastAPI backend" in prompt
    assert "package.json" in prompt
    assert "feat: add health endpoint" in prompt
    assert "alice" in prompt


def test_build_repo_prompt_truncates_oversized_readme():
    huge_readme = "x" * 20000
    prompt = _build_repo_prompt("repo", "main", [], readme=huge_readme)
    assert "(truncated)" in prompt
    # Should cap near the 10000-char limit, not include the full 20000
    assert len(prompt) < 15000


def test_build_repo_prompt_uses_only_first_line_of_commit_message():
    commits = [{"comment": "feat: short subject\n\nLonger body that should not appear"}]
    prompt = _build_repo_prompt("repo", "main", commits)
    assert "short subject" in prompt
    assert "should not appear" not in prompt


# ---------------------------------------------------------------------------
# _build_pipelines_prompt
# ---------------------------------------------------------------------------


def test_build_pipelines_prompt_empty_runs():
    pipelines = [{"id": 1, "name": "build-and-test"}]
    prompt = _build_pipelines_prompt("planr", pipelines, {})
    assert "build-and-test" in prompt
    assert "no recent runs" in prompt


def test_build_pipelines_prompt_with_runs():
    pipelines = [{"id": 1, "name": "build-and-test"}]
    runs = {1: [{"state": "completed", "result": "succeeded", "finishedDate": "2026-04-16T10:00:00Z"}]}
    prompt = _build_pipelines_prompt("planr", pipelines, runs)
    assert "build-and-test" in prompt
    assert "succeeded" in prompt


# ---------------------------------------------------------------------------
# _build_wiki_page_classifier_prompt + _parse_classifier_output
# ---------------------------------------------------------------------------


def test_classifier_prompt_includes_pages():
    pages = [{"id": "1", "title": "Architecture", "content": "We use FastAPI and Postgres."}]
    prompt = _build_wiki_page_classifier_prompt("planr.wiki", pages)
    assert "Architecture" in prompt
    assert "FastAPI" in prompt
    assert "JSON array" in prompt


def test_parse_classifier_output_plain_json():
    raw = '[{"id":"42","category":"architecture","description":"Monorepo layout"}]'
    out = _parse_classifier_output(raw)
    assert out["42"]["category"] == "architecture"
    assert "Monorepo" in out["42"]["description"]


def test_parse_classifier_output_strips_code_fences():
    raw = "```json\n[{\"id\":\"7\",\"category\":\"security\",\"description\":\"IAM overview\"}]\n```"
    out = _parse_classifier_output(raw)
    assert out["7"]["category"] == "security"


def test_parse_classifier_output_falls_back_to_documentation_for_unknown_category():
    raw = '[{"id":"9","category":"not-a-real-category","description":"x"}]'
    out = _parse_classifier_output(raw)
    assert out["9"]["category"] == "documentation"


def test_parse_classifier_output_handles_malformed_json():
    assert _parse_classifier_output("not json") == {}
    assert _parse_classifier_output("{not-an-array: true}") == {}


def test_parse_classifier_output_ignores_items_without_id():
    raw = '[{"category":"frontend","description":"no id here"}, {"id":"1","category":"backend","description":"ok"}]'
    out = _parse_classifier_output(raw)
    assert list(out.keys()) == ["1"]
