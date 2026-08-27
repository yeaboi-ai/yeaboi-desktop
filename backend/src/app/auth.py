import logging

import jwt
from fastapi import HTTPException, Request

from .config import get_settings

logger = logging.getLogger(__name__)


def decode_jwt(token: str) -> dict:
    """Decode and validate a NextAuth-issued JWT."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.nextauth_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        logger.warning("Invalid JWT token")
        raise HTTPException(status_code=401, detail="Invalid token")

    logger.debug("JWT decoded for: %s", payload.get("email"))
    return payload


def get_token_from_request(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        logger.debug("Missing or malformed Authorization header")
        raise HTTPException(status_code=401, detail="Missing authorization header")
    return auth.removeprefix("Bearer ").strip()
