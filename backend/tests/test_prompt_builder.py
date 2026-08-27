"""Tests for agent/prompt_builder.py — persona prompts and blueprint context."""

from agent.prompt_builder import (
    ASSERTIVENESS_PROMPTS,
    BLUEPRINT_SECTIONS,
    PERSONA_PROMPTS,
    build_text_prompt,
)


def test_all_personas_have_prompts():
    for persona in ["default", "pm", "architect", "mentor", "challenger"]:
        assert persona in PERSONA_PROMPTS
        assert len(PERSONA_PROMPTS[persona]) > 10


def test_all_assertiveness_levels_exist():
    for level in ["passive", "balanced", "active"]:
        assert level in ASSERTIVENESS_PROMPTS


def test_build_text_prompt_default():
    prompt = build_text_prompt({"persona": "default", "assertiveness": "balanced"})
    assert "sharp, opinionated senior engineer" in prompt
    assert "facilitating a collaborative planning session" in prompt
    # Balanced assertiveness adds no extra text
    assert "Drive the conversation aggressively" not in prompt


def test_build_text_prompt_with_persona():
    prompt = build_text_prompt({"persona": "pm"})
    assert "product manager" in prompt


def test_build_text_prompt_active_assertiveness():
    prompt = build_text_prompt({"persona": "default", "assertiveness": "active"})
    assert "Drive the conversation aggressively" in prompt


def test_build_text_prompt_passive_assertiveness():
    prompt = build_text_prompt({"persona": "default", "assertiveness": "passive"})
    assert "Only respond when directly asked" in prompt


def test_build_text_prompt_with_blueprint():
    bp = {"project_overview": "A todo app", "tech_stack": "React + Node"}
    prompt = build_text_prompt({"persona": "default"}, blueprint=bp)
    assert "Sections filled:" in prompt
    assert "project_overview" in prompt
    assert "tech_stack" in prompt


def test_build_text_prompt_empty_blueprint():
    bp = {s: "" for s in BLUEPRINT_SECTIONS}
    prompt = build_text_prompt({"persona": "default"}, blueprint=bp)
    assert "Sections filled: none" in prompt


def test_build_text_prompt_with_initial_idea():
    prompt = build_text_prompt({"persona": "default"}, initial_idea="Build a task manager")
    assert "Project idea: Build a task manager" in prompt


def test_build_text_prompt_unknown_persona_falls_back():
    prompt = build_text_prompt({"persona": "nonexistent"})
    # Should fall back to default persona
    assert "sharp, opinionated senior engineer" in prompt


def test_build_text_prompt_missing_config_keys():
    prompt = build_text_prompt({})
    assert "sharp, opinionated senior engineer" in prompt
    assert "facilitating a collaborative planning session" in prompt


def test_blueprint_sections_count():
    assert len(BLUEPRINT_SECTIONS) == 10
