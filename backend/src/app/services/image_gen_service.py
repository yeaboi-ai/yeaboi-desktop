import base64
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)


async def generate_mockup(description: str) -> bytes | None:
    """Use DALL-E 3 to generate a UI mockup from a description.

    Returns PNG image bytes or None if generation fails.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        logger.warning("No OpenAI API key — image generation disabled")
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.images.generate(
            model="dall-e-3",
            prompt=(
                f"Clean, professional UI wireframe mockup: {description}. "
                "Minimal style, white background, clear layout with labeled components."
            ),
            size="1024x1024",
            quality="standard",
            response_format="b64_json",
            n=1,
        )

        image_data = response.data[0].b64_json
        if image_data:
            return base64.b64decode(image_data)
        return None

    except Exception as e:
        logger.error("Image generation error: %s", e)
        return None
