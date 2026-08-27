import base64
import logging

from ..config import get_settings
from . import provider_health
from .provider_errors import ProviderError, classify

logger = logging.getLogger(__name__)


async def analyze_screenshot(
    image_bytes: bytes,
    prompt: str = "Describe this UI screenshot. Identify the layout, components, navigation, and key features.",
    *,
    scope: str = "platform",
) -> str | None:
    """Use Gemini to analyze a screenshot and return structured description.

    Provider failures are classified via the standard `provider_errors`
    pipeline so credit-exhaustion / invalid-key states for the Google key
    propagate to the global health snapshot. The function still returns
    None on classified failures (keeping callers' optional-result contract
    intact); unclassified errors are logged + return None as before.
    """
    settings = get_settings()
    if not settings.google_api_key:
        logger.warning("No Google API key — vision disabled")
        return None

    try:
        from google import genai

        client = genai.Client(api_key=settings.google_api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                prompt,
                {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(image_bytes).decode()}},
            ],
        )
    except Exception as exc:
        provider_error = classify(exc, provider="google", scope=scope)
        if isinstance(provider_error, ProviderError):
            await provider_health.mark_unhealthy(scope, "google", provider_error)
            logger.warning(
                "Vision (Google) marked unhealthy: %s — %s", provider_error.code, provider_error.message
            )
        else:
            logger.error("Vision analysis error: %s", exc)
        return None

    await provider_health.mark_healthy(scope, "google")
    return response.text
