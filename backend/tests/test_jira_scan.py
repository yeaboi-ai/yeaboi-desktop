"""Tests for the Jira scan connector."""

from src.app.services.connectors.jira_scan import (
    _build_health_prompt,
    _build_project_prompt,
)

# ---------------------------------------------------------------------------
# _build_project_prompt
# ---------------------------------------------------------------------------


def test_build_project_prompt_includes_data():
    project = {"key": "PLAT", "name": "Platform", "lead": {"displayName": "Alice"}}
    issues = [
        {
            "key": "PLAT-1",
            "fields": {
                "summary": "Fix login",
                "status": {"name": "Done"},
                "issuetype": {"name": "Bug"},
                "priority": {"name": "High"},
            },
        }
    ]
    prompt = _build_project_prompt(project, issues, [])
    assert "PLAT" in prompt
    assert "Platform" in prompt
    assert "Fix login" in prompt


def test_build_project_prompt_includes_lead():
    project = {"key": "CORE", "name": "Core Services", "lead": {"displayName": "Bob"}}
    prompt = _build_project_prompt(project, [], [])
    assert "Bob" in prompt


def test_build_project_prompt_includes_sprints():
    project = {"key": "PLAT", "name": "Platform"}
    sprints = [
        {"name": "Sprint 10", "state": "active", "goal": "Ship auth"},
        {"name": "Sprint 11", "state": "future", "goal": ""},
    ]
    prompt = _build_project_prompt(project, [], sprints)
    assert "Sprint 10" in prompt
    assert "active" in prompt
    assert "Ship auth" in prompt
    assert "Sprint 11" in prompt
    assert "future" in prompt


def test_build_project_prompt_includes_issue_details():
    project = {"key": "PLAT", "name": "Platform"}
    issues = [
        {
            "key": "PLAT-42",
            "fields": {
                "summary": "Migrate database",
                "status": {"name": "In Progress"},
                "issuetype": {"name": "Story"},
                "priority": {"name": "Medium"},
            },
        }
    ]
    prompt = _build_project_prompt(project, issues, [])
    assert "PLAT-42" in prompt
    assert "Migrate database" in prompt
    assert "In Progress" in prompt
    assert "Story" in prompt
    assert "Medium" in prompt


def test_build_project_prompt_limits_issues_to_100():
    project = {"key": "PLAT", "name": "Platform"}
    issues = [
        {
            "key": f"PLAT-{i}",
            "fields": {
                "summary": f"Issue {i}",
                "status": {"name": "Open"},
                "issuetype": {"name": "Task"},
                "priority": {"name": "Low"},
            },
        }
        for i in range(120)
    ]
    prompt = _build_project_prompt(project, issues, [])
    assert "PLAT-99" in prompt  # 100th issue (0-indexed)
    assert "PLAT-100 " not in prompt  # 101st issue should not be in the listing
    # but it MIGHT appear in aggregate counts — match the "- [PLAT-100]" pattern specifically
    assert "[PLAT-100]" not in prompt


def test_build_project_prompt_handles_missing_lead():
    project = {"key": "PLAT", "name": "Platform"}
    prompt = _build_project_prompt(project, [], [])
    assert "Unknown" in prompt


def test_build_project_prompt_handles_none_lead():
    project = {"key": "PLAT", "name": "Platform", "lead": None}
    prompt = _build_project_prompt(project, [], [])
    assert "Unknown" in prompt


def test_build_project_prompt_empty_issues_and_sprints():
    project = {"key": "PLAT", "name": "Platform", "lead": {"displayName": "Alice"}}
    prompt = _build_project_prompt(project, [], [])
    assert "PLAT" in prompt
    assert "Platform" in prompt
    # Should still contain analysis instruction
    assert "delivery health" in prompt.lower()


# ---------------------------------------------------------------------------
# _build_health_prompt
# ---------------------------------------------------------------------------


def test_build_health_prompt_includes_velocity():
    projects = [{"key": "PLAT", "name": "Platform"}]
    sprints = [{"name": "Sprint 1", "state": "active", "goal": "Launch MVP"}]
    prompt = _build_health_prompt(projects, sprints, 42)
    assert "Sprint 1" in prompt
    assert "42" in prompt


def test_build_health_prompt_includes_projects():
    projects = [
        {"key": "PLAT", "name": "Platform"},
        {"key": "CORE", "name": "Core Services"},
    ]
    prompt = _build_health_prompt(projects, [], 100)
    assert "PLAT" in prompt
    assert "Platform" in prompt
    assert "CORE" in prompt
    assert "Core Services" in prompt


def test_build_health_prompt_includes_sprint_goals():
    projects = [{"key": "X", "name": "X"}]
    sprints = [
        {"name": "Sprint A", "state": "active", "goal": "Finish onboarding"},
        {"name": "Sprint B", "state": "future", "goal": ""},
    ]
    prompt = _build_health_prompt(projects, sprints, 10)
    assert "Sprint A" in prompt
    assert "Finish onboarding" in prompt
    assert "Sprint B" in prompt


def test_build_health_prompt_shows_total_issues():
    projects = [{"key": "A", "name": "Alpha"}]
    prompt = _build_health_prompt(projects, [], 256)
    assert "256" in prompt


def test_build_health_prompt_empty_inputs():
    prompt = _build_health_prompt([], [], 0)
    assert "0" in prompt
    assert "delivery health" in prompt.lower()


def test_build_health_prompt_multiple_sprints():
    projects = [{"key": "X", "name": "X"}]
    sprints = [
        {"name": f"Sprint {i}", "state": "active", "goal": f"Goal {i}"}
        for i in range(5)
    ]
    prompt = _build_health_prompt(projects, sprints, 50)
    for i in range(5):
        assert f"Sprint {i}" in prompt
        assert f"Goal {i}" in prompt
