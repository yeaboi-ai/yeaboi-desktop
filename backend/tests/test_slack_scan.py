"""Tests for the Slack scan connector."""

from src.app.services.connectors.slack_scan import (
    _CHANNEL_CATEGORIES,
    _build_channel_prompt,
    _build_classifier_prompt,
    _build_workspace_prompt,
    _parse_classifier_output,
    _resolve_mentions,
    _slugify,
)

# ---------------------------------------------------------------------------
# _resolve_mentions
# ---------------------------------------------------------------------------


def test_resolve_mentions_user_id_to_name():
    text = "hey <@U12345> can you review this?"
    users = {"U12345": "alice"}
    channels: dict[str, str] = {}
    assert _resolve_mentions(text, users, channels) == "hey @alice can you review this?"


def test_resolve_mentions_unknown_user_falls_back_to_id():
    text = "<@U999> ship it"
    assert _resolve_mentions(text, {}, {}) == "@U999 ship it"


def test_resolve_mentions_channel_id_to_name_from_cache():
    text = "see <#C123> for context"
    channels = {"C123": "planning"}
    assert _resolve_mentions(text, {}, channels) == "see #planning for context"


def test_resolve_mentions_channel_with_inline_label():
    # Slack mentions often include the channel name after a pipe
    text = "see <#C123|planning> for context"
    assert _resolve_mentions(text, {}, {}) == "see #planning for context"


def test_resolve_mentions_link_with_label():
    text = "docs: <https://example.com/doc|the runbook>"
    assert _resolve_mentions(text, {}, {}) == "docs: the runbook (https://example.com/doc)"


def test_resolve_mentions_bare_link():
    text = "see <https://example.com>"
    assert _resolve_mentions(text, {}, {}) == "see https://example.com"


def test_resolve_mentions_empty_input():
    assert _resolve_mentions("", {}, {}) == ""
    assert _resolve_mentions(None, {}, {}) == ""  # type: ignore[arg-type]


def test_resolve_mentions_combined():
    text = "<@U1> pinged <#C1|general> about <https://ex.com|the doc>"
    users = {"U1": "bob"}
    assert _resolve_mentions(text, users, {}) == "@bob pinged #general about the doc (https://ex.com)"


# ---------------------------------------------------------------------------
# _slugify
# ---------------------------------------------------------------------------


def test_slugify_basic():
    assert _slugify("Planning Channel") == "planning-channel"


def test_slugify_handles_special_chars():
    assert _slugify("eng/backend!!") == "eng-backend"


def test_slugify_empty_falls_back():
    assert _slugify("") == "untitled"
    assert _slugify("   ") == "untitled"


def test_slugify_truncates_long_input():
    long = "a" * 200
    assert len(_slugify(long)) == 80


# ---------------------------------------------------------------------------
# _build_channel_prompt
# ---------------------------------------------------------------------------


def test_build_channel_prompt_includes_name_topic_purpose():
    messages = [{"user_name": "alice", "text": "deploying at 3pm"}]
    prompt = _build_channel_prompt("deploys", "Daily deploys", "Coordination", messages)
    assert "#deploys" in prompt
    assert "Daily deploys" in prompt
    assert "Coordination" in prompt
    assert "@alice" in prompt
    assert "deploying at 3pm" in prompt


def test_build_channel_prompt_handles_no_topic_or_purpose():
    messages = [{"user_name": "bob", "text": "hello"}]
    prompt = _build_channel_prompt("general", "", "", messages)
    assert "#general" in prompt
    assert "Topic:" not in prompt
    assert "Purpose:" not in prompt


def test_build_channel_prompt_skips_empty_messages():
    messages = [
        {"user_name": "alice", "text": ""},
        {"user_name": "bob", "text": "real message"},
    ]
    prompt = _build_channel_prompt("c", "", "", messages)
    assert "real message" in prompt
    assert "@alice:" not in prompt


def test_build_channel_prompt_truncates_long_messages():
    long_msg = "x" * 600
    messages = [{"user_name": "alice", "text": long_msg}]
    prompt = _build_channel_prompt("c", "", "", messages)
    # Truncation marker must appear and full 600-char body must not
    assert "…" in prompt
    assert long_msg not in prompt


def test_build_channel_prompt_includes_summary_instruction():
    messages = [{"user_name": "alice", "text": "hi"}]
    prompt = _build_channel_prompt("c", "", "", messages)
    assert "team knowledge directory" in prompt.lower()


# ---------------------------------------------------------------------------
# _build_workspace_prompt
# ---------------------------------------------------------------------------


def test_build_workspace_prompt_includes_team_name_and_channels():
    summaries = [
        {"name": "planning", "summary": "Sprint kickoffs and triage."},
        {"name": "deploys", "summary": "Deploy coordination messages."},
    ]
    prompt = _build_workspace_prompt("Planr Team", summaries)
    assert "Planr Team" in prompt
    assert "#planning" in prompt
    assert "Sprint kickoffs" in prompt
    assert "#deploys" in prompt


def test_build_workspace_prompt_limits_to_40_channels():
    summaries = [{"name": f"ch{i}", "summary": f"summary {i}"} for i in range(60)]
    prompt = _build_workspace_prompt("Big Team", summaries)
    assert "#ch39" in prompt
    assert "#ch40" not in prompt


def test_build_workspace_prompt_empty_list():
    prompt = _build_workspace_prompt("Empty Workspace", [])
    assert "Empty Workspace" in prompt
    assert "0" in prompt  # channels scanned


def test_build_workspace_prompt_includes_overview_instruction():
    prompt = _build_workspace_prompt("Team", [{"name": "c", "summary": "s"}])
    assert "workspace-level overview" in prompt.lower()


# ---------------------------------------------------------------------------
# _build_classifier_prompt + _parse_classifier_output
# ---------------------------------------------------------------------------


def test_build_classifier_prompt_includes_channel_names_and_categories():
    summaries = [
        {"name": "deploys", "summary": "Infra and rollouts"},
        {"name": "design", "summary": "UI design reviews"},
    ]
    prompt = _build_classifier_prompt(summaries)
    assert "deploys" in prompt
    assert "design" in prompt
    for category in _CHANNEL_CATEGORIES:
        assert category in prompt


def test_parse_classifier_output_valid_json():
    raw = '[{"name": "deploys", "category": "infrastructure"}, {"name": "design", "category": "frontend"}]'
    result = _parse_classifier_output(raw)
    assert result == {"deploys": "infrastructure", "design": "frontend"}


def test_parse_classifier_output_strips_code_fences():
    raw = '```json\n[{"name": "c", "category": "backend"}]\n```'
    result = _parse_classifier_output(raw)
    assert result == {"c": "backend"}


def test_parse_classifier_output_unknown_category_falls_back_to_documentation():
    raw = '[{"name": "c", "category": "nonexistent"}]'
    result = _parse_classifier_output(raw)
    assert result == {"c": "documentation"}


def test_parse_classifier_output_skips_items_without_name():
    raw = '[{"category": "backend"}, {"name": "keep", "category": "frontend"}]'
    result = _parse_classifier_output(raw)
    assert result == {"keep": "frontend"}


def test_parse_classifier_output_invalid_json_returns_empty():
    assert _parse_classifier_output("not json at all") == {}


def test_parse_classifier_output_non_list_returns_empty():
    assert _parse_classifier_output('{"name": "c"}') == {}
