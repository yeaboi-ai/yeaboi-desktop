from unittest.mock import AsyncMock, MagicMock, patch

from src.app.services.image_gen_service import generate_mockup
from src.app.services.vision_service import analyze_screenshot


async def test_vision_disabled_without_key():
    with patch("src.app.services.vision_service.get_settings") as mock:
        mock.return_value.google_api_key = ""
        result = await analyze_screenshot(b"fake_image")
    assert result is None


async def test_vision_returns_analysis():
    mock_response = MagicMock()
    mock_response.text = "This is a dashboard with a sidebar and main content area."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    mock_genai_module = MagicMock()
    mock_genai_module.Client.return_value = mock_client

    # Patch the lazy import inside analyze_screenshot by injecting into sys.modules
    mock_google = MagicMock()
    mock_google.genai = mock_genai_module

    with patch("src.app.services.vision_service.get_settings") as mock_settings:
        mock_settings.return_value.google_api_key = "test-key"
        with patch.dict("sys.modules", {"google": mock_google, "google.genai": mock_genai_module}):
            result = await analyze_screenshot(b"fake_image")

    assert result == "This is a dashboard with a sidebar and main content area."
    assert "dashboard" in result.lower()


async def test_image_gen_disabled_without_key():
    with patch("src.app.services.image_gen_service.get_settings") as mock:
        mock.return_value.openai_api_key = ""
        result = await generate_mockup("A dashboard with charts")
    assert result is None
