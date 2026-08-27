from unittest.mock import MagicMock, patch

import pytest

from src.app.services.email_service import send_invite_email


@pytest.mark.asyncio
async def test_email_disabled_without_key():
    with patch("src.app.services.email_service.get_settings") as mock:
        mock.return_value.resend_api_key = ""
        result = await send_invite_email("test@example.com", "Alice", "alice@example.com")
    assert result is False


@pytest.mark.asyncio
async def test_email_sends_successfully():
    with patch("src.app.services.email_service.get_settings") as mock_settings:
        mock_settings.return_value.resend_api_key = "test-key"
        mock_settings.return_value.app_url = "http://localhost:3001"
        with patch.dict("sys.modules", {"resend": MagicMock()}):
            import sys

            mock_resend = sys.modules["resend"]
            mock_resend.Emails.send = MagicMock(return_value={"id": "123"})
            result = await send_invite_email("bob@example.com", "Alice", "alice@example.com")
    assert result is True


@pytest.mark.asyncio
async def test_email_returns_false_on_exception():
    with patch("src.app.services.email_service.get_settings") as mock_settings:
        mock_settings.return_value.resend_api_key = "test-key"
        mock_settings.return_value.app_url = "http://localhost:3001"
        with patch.dict("sys.modules", {"resend": MagicMock()}):
            import sys

            mock_resend = sys.modules["resend"]
            mock_resend.Emails.send = MagicMock(side_effect=Exception("Network error"))
            result = await send_invite_email("bob@example.com", "Alice", "alice@example.com")
    assert result is False
