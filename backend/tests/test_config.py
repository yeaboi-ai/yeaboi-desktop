from src.app.config import get_settings


def test_slack_signing_secret_optional(monkeypatch):
    monkeypatch.delenv("SLACK_SIGNING_SECRET", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.slack_signing_secret == ""


def test_slack_interactive_flag_defaults_off(monkeypatch):
    monkeypatch.delenv("SLACK_INTERACTIVE_ENABLED", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.slack_interactive_enabled is False
