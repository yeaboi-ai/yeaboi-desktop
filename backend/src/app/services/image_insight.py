"""Reading a screenshot with the model's eyes.

The prompt used to sit inline in ``POST /api/sessions/{id}/analyze-image``.
It lives here because a project's attached mockups are read the same way when
its first planning session opens, and one wording should serve both.
"""

from __future__ import annotations

import base64
from typing import Any

VISION_PROMPT = (
    "Analyze this UI design/screenshot and extract:\n"
    "1. Layout structure (grid, sidebar, header, etc.)\n"
    "2. Color palette (primary, secondary, accent colors as hex)\n"
    "3. Typography observations (serif/sans-serif, sizes)\n"
    "4. Key UI components visible (cards, forms, tables, nav, etc.)\n"
    "5. Design style (minimal, material, glassmorphism, etc.)\n"
    "6. Suggested improvements or patterns to follow\n\n"
    "Be concise and actionable. Format as clear sections."
)


async def describe_image(ai: Any, data: bytes, media_type: str, *, max_tokens: int = 2048) -> str:
    """What the model sees in one image. ``ai`` is an AIClient."""
    b64 = base64.b64encode(data).decode()
    return await ai.chat(
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }
        ],
        max_tokens=max_tokens,
    )
