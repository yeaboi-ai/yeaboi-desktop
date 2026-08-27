"""GitHub App authentication service.

Handles JWT generation, installation token exchange, and installation management
for the GitHub App integration.
"""

import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root so os.getenv() sees GitHub App credentials
_env_path = Path(__file__).resolve().parents[4] / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

import httpx
import jwt  # PyJWT

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


def get_app_config() -> dict | None:
    """Return GitHub App config from env vars, or None if not configured."""
    app_id = os.getenv("GITHUB_APP_ID")
    private_key = os.getenv("GITHUB_APP_PRIVATE_KEY", "").replace("\\n", "\n")
    slug = os.getenv("GITHUB_APP_SLUG", "")
    if not app_id or not private_key:
        return None
    return {"app_id": app_id, "private_key": private_key, "slug": slug}


def generate_app_jwt() -> str:
    """Generate a JWT for authenticating as the GitHub App.

    JWTs are valid for up to 10 minutes. We use 9 minutes to avoid clock drift.
    """
    config = get_app_config()
    if not config:
        raise ValueError("GitHub App not configured (missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY)")

    now = int(time.time())
    payload = {
        "iat": now - 60,  # Issued 60 seconds in the past for clock drift
        "exp": now + (9 * 60),  # 9 minutes
        "iss": config["app_id"],
    }
    return jwt.encode(payload, config["private_key"], algorithm="RS256")


async def get_installation_token(installation_id: str) -> dict:
    """Exchange app JWT for a short-lived installation access token.

    Returns {"token": "...", "expires_at": "...", "permissions": {...}, "repositories": [...]}
    """
    app_jwt = generate_app_jwt()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if resp.status_code != 201:
        logger.error("Failed to get installation token: %s %s", resp.status_code, resp.text[:200])
        raise ValueError(f"GitHub API error: {resp.status_code}")
    return resp.json()


async def get_installation_details(installation_id: str) -> dict:
    """Fetch details about a GitHub App installation (permissions, account, etc.)."""
    app_jwt = generate_app_jwt()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GITHUB_API}/app/installations/{installation_id}",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if resp.status_code != 200:
        logger.error("Failed to get installation details: %s %s", resp.status_code, resp.text[:200])
        raise ValueError(f"GitHub API error: {resp.status_code}")
    return resp.json()


async def get_installation_repos(installation_id: str) -> list[dict]:
    """Fetch the list of repos accessible to an installation."""
    token_data = await get_installation_token(installation_id)
    token = token_data["token"]

    repos = []
    page = 1
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            resp = await client.get(
                f"{GITHUB_API}/installation/repositories",
                params={"per_page": 100, "page": page},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            repos.extend(
                [
                    {
                        "id": r["id"],
                        "name": r["full_name"],
                        "private": r["private"],
                        "default_branch": r["default_branch"],
                    }
                    for r in data.get("repositories", [])
                ]
            )
            if len(data.get("repositories", [])) < 100:
                break
            page += 1
    return repos


def get_installation_url() -> str | None:
    """Return the URL to install the GitHub App, or None if not configured."""
    config = get_app_config()
    if not config or not config["slug"]:
        return None
    return f"https://github.com/apps/{config['slug']}/installations/new"
