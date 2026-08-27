"""Tests for the GitHub scan connector."""

import pytest

from src.app.services.connectors.github_scan import (
    CATEGORY_PROMPTS,
    _build_category_prompt,
    _categorize_files,
)


# ---------------------------------------------------------------------------
# _categorize_files
# ---------------------------------------------------------------------------


def test_categorize_files_detects_frontend():
    files = {
        "package.json": '{"dependencies": {"react": "^19.0.0"}}',
        "tsconfig.json": '{"compilerOptions": {}}',
    }
    categories = _categorize_files(files, "TypeScript")
    assert "frontend" in categories
    assert "package.json" in categories["frontend"]
    assert "tsconfig.json" in categories["frontend"]


def test_categorize_files_detects_infrastructure():
    files = {
        "Dockerfile": "FROM node:20",
        ".github/workflows/ci.yml": "on: push",
    }
    categories = _categorize_files(files, "TypeScript")
    assert "infrastructure" in categories
    assert "Dockerfile" in categories["infrastructure"]
    assert ".github/workflows/ci.yml" in categories["infrastructure"]


def test_categorize_files_detects_backend():
    files = {
        "requirements.txt": "fastapi==0.115.0\nsqlalchemy==2.0.0",
    }
    categories = _categorize_files(files, "Python")
    assert "backend" in categories
    assert "requirements.txt" in categories["backend"]


def test_categorize_files_detects_security():
    files = {
        "requirements.txt": "fastapi==0.115.0",
        "package.json": '{"dependencies": {"lodash": "^4.17.0"}}',
    }
    categories = _categorize_files(files, "Python")
    assert "security" in categories
    assert "requirements.txt" in categories["security"]
    assert "package.json" in categories["security"]


def test_categorize_files_readme_goes_to_services_and_overview():
    files = {
        "README.md": "# My Project\nA cool project.",
    }
    categories = _categorize_files(files, "Python")
    assert "services" in categories
    assert "overview" in categories
    assert "README.md" in categories["services"]
    assert "README.md" in categories["overview"]


def test_categorize_files_folder_structure_goes_to_services_and_overview():
    files = {
        "_folder_structure": '["src", "tests", "docs"]',
    }
    categories = _categorize_files(files, "Python")
    assert "services" in categories
    assert "overview" in categories


def test_categorize_files_workflow_detected_as_infra():
    files = {
        ".github/workflows/deploy.yml": "on: push\njobs: ...",
    }
    categories = _categorize_files(files, "TypeScript")
    assert "infrastructure" in categories
    assert ".github/workflows/deploy.yml" in categories["infrastructure"]


def test_categorize_files_empty_input():
    categories = _categorize_files({}, "Python")
    assert categories == {}


def test_categorize_files_unrecognized_files():
    files = {
        "random.txt": "hello world",
        "src/main.py": "import os",
    }
    categories = _categorize_files(files, "Python")
    assert categories == {}


def test_categorize_files_file_appears_in_multiple_categories():
    """package.json appears in frontend, backend, and security."""
    files = {
        "package.json": '{"dependencies": {"react": "^19"}}',
    }
    categories = _categorize_files(files, "TypeScript")
    assert "frontend" in categories
    assert "backend" in categories
    assert "security" in categories
    assert "package.json" in categories["frontend"]
    assert "package.json" in categories["backend"]
    assert "package.json" in categories["security"]


# ---------------------------------------------------------------------------
# _build_category_prompt
# ---------------------------------------------------------------------------


def test_build_category_prompt_includes_files():
    files = {"package.json": '{"name": "my-app"}'}
    prompt = _build_category_prompt("frontend", files, "my-repo", "TypeScript")
    assert "package.json" in prompt
    assert "my-app" in prompt
    assert "my-repo" in prompt


def test_build_category_prompt_includes_category_instruction():
    files = {"Dockerfile": "FROM python:3.11"}
    prompt = _build_category_prompt("infrastructure", files, "backend-svc", "Python")
    assert CATEGORY_PROMPTS["infrastructure"] in prompt
    assert "backend-svc" in prompt
    assert "Python" in prompt


def test_build_category_prompt_includes_language():
    files = {"go.mod": "module example.com/mymod"}
    prompt = _build_category_prompt("backend", files, "go-svc", "Go")
    assert "Go" in prompt


def test_build_category_prompt_truncates_long_content():
    long_content = "x" * 12000
    files = {"big_file.json": long_content}
    prompt = _build_category_prompt("frontend", files, "repo", "TypeScript")
    # Should contain at most 8000 chars of the file content plus truncation marker
    assert "... (truncated)" in prompt
    # The full 12000-char string should not appear
    assert long_content not in prompt


def test_build_category_prompt_multiple_files():
    files = {
        "package.json": '{"name": "app"}',
        "tsconfig.json": '{"compilerOptions": {"strict": true}}',
    }
    prompt = _build_category_prompt("frontend", files, "multi-repo", "TypeScript")
    assert "package.json" in prompt
    assert "tsconfig.json" in prompt
    assert "multi-repo" in prompt


def test_build_category_prompt_unknown_category_falls_back_to_overview():
    files = {"README.md": "# Hello"}
    prompt = _build_category_prompt("nonexistent", files, "repo", "Python")
    # Should fall back to overview prompt
    assert CATEGORY_PROMPTS["overview"] in prompt
