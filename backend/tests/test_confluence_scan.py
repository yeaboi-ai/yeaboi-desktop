"""Tests for the Confluence scan connector."""

from src.app.services.connectors.confluence_scan import (
    _build_space_prompt,
    _strip_html,
)


# ---------------------------------------------------------------------------
# _strip_html
# ---------------------------------------------------------------------------


def test_strip_html_removes_tags():
    html = "<h1>Title</h1><p>Hello <b>world</b></p>"
    result = _strip_html(html)
    assert result == "Title Hello world"


def test_strip_html_handles_empty():
    assert _strip_html("") == ""
    assert _strip_html(None) == ""


def test_strip_html_preserves_plain_text():
    text = "Just plain text"
    assert _strip_html(text) == "Just plain text"


def test_strip_html_collapses_whitespace():
    html = "<p>Hello</p>   <p>World</p>"
    result = _strip_html(html)
    assert result == "Hello World"


def test_strip_html_handles_nested_tags():
    html = "<div><p>Outer <span>inner <b>bold</b></span> text</p></div>"
    result = _strip_html(html)
    assert result == "Outer inner bold text"


def test_strip_html_handles_self_closing_tags():
    html = "Before<br/>After<hr/>End"
    result = _strip_html(html)
    assert "Before" in result
    assert "After" in result
    assert "End" in result


def test_strip_html_handles_attributes():
    html = '<a href="https://example.com" class="link">Click here</a>'
    result = _strip_html(html)
    assert result == "Click here"


def test_strip_html_handles_html_entities_passthrough():
    """HTML entities are passed through as-is (not decoded)."""
    html = "<p>Hello &amp; World</p>"
    result = _strip_html(html)
    assert "Hello" in result
    assert "World" in result


# ---------------------------------------------------------------------------
# _build_space_prompt
# ---------------------------------------------------------------------------


def test_build_space_prompt_includes_pages():
    pages = [
        {"title": "Architecture Overview", "content": "Our system uses microservices..."},
        {"title": "Onboarding Guide", "content": "Welcome to the team..."},
    ]
    prompt = _build_space_prompt("Engineering Wiki", pages)
    assert "Engineering Wiki" in prompt
    assert "Architecture Overview" in prompt
    assert "microservices" in prompt


def test_build_space_prompt_includes_space_name():
    pages = [{"title": "Page 1", "content": "Content 1"}]
    prompt = _build_space_prompt("Product Docs", pages)
    assert "Product Docs" in prompt


def test_build_space_prompt_includes_page_count():
    pages = [{"title": f"Page {i}", "content": f"Content {i}"} for i in range(5)]
    prompt = _build_space_prompt("My Space", pages)
    assert "5" in prompt


def test_build_space_prompt_truncates_long_content():
    long_content = "x" * 10000
    pages = [{"title": "Big Page", "content": long_content}]
    prompt = _build_space_prompt("Space", pages)
    assert "... (truncated)" in prompt
    # Full content should not appear
    assert long_content not in prompt


def test_build_space_prompt_limits_pages_to_40():
    pages = [{"title": f"Page {i}", "content": f"Content {i}"} for i in range(60)]
    prompt = _build_space_prompt("Space", pages)
    assert "Page 39" in prompt  # 40th page (0-indexed)
    assert "Page 40" not in prompt  # 41st page should be excluded


def test_build_space_prompt_empty_pages():
    prompt = _build_space_prompt("Empty Space", [])
    assert "Empty Space" in prompt
    assert "0" in prompt  # Page count


def test_build_space_prompt_includes_analysis_instruction():
    pages = [{"title": "A Page", "content": "Some content"}]
    prompt = _build_space_prompt("Space", pages)
    assert "documentation" in prompt.lower()


def test_build_space_prompt_handles_missing_content():
    pages = [{"title": "No Content Page"}]
    prompt = _build_space_prompt("Space", pages)
    assert "No Content Page" in prompt


def test_build_space_prompt_multiple_pages_with_content():
    pages = [
        {"title": "API Reference", "content": "REST endpoints for the platform"},
        {"title": "Deployment Guide", "content": "Steps to deploy to production"},
        {"title": "Runbook", "content": "Incident response procedures"},
    ]
    prompt = _build_space_prompt("Engineering", pages)
    assert "API Reference" in prompt
    assert "REST endpoints" in prompt
    assert "Deployment Guide" in prompt
    assert "deploy to production" in prompt
    assert "Runbook" in prompt
    assert "Incident response" in prompt
