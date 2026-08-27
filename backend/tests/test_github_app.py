"""Tests for the GitHub App service."""

from src.app.services.github_app import (
    get_app_config,
    get_installation_url,
)


def test_get_app_config_returns_none_when_not_configured(monkeypatch):
    monkeypatch.delenv("GITHUB_APP_ID", raising=False)
    monkeypatch.delenv("GITHUB_APP_PRIVATE_KEY", raising=False)
    assert get_app_config() is None


def test_get_app_config_returns_config(monkeypatch):
    monkeypatch.setenv("GITHUB_APP_ID", "12345")
    monkeypatch.setenv("GITHUB_APP_PRIVATE_KEY", "fake-key")
    monkeypatch.setenv("GITHUB_APP_SLUG", "my-app")
    config = get_app_config()
    assert config["app_id"] == "12345"
    assert config["slug"] == "my-app"


def test_get_installation_url(monkeypatch):
    monkeypatch.setenv("GITHUB_APP_ID", "12345")
    monkeypatch.setenv("GITHUB_APP_PRIVATE_KEY", "fake-key")
    monkeypatch.setenv("GITHUB_APP_SLUG", "my-planning-app")
    url = get_installation_url()
    assert url == "https://github.com/apps/my-planning-app/installations/new"


def test_get_installation_url_none_when_not_configured(monkeypatch):
    monkeypatch.delenv("GITHUB_APP_ID", raising=False)
    assert get_installation_url() is None
