from __future__ import annotations

import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "harness"


def _get_jinja_env() -> Environment:
    return Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), trim_blocks=True, lstrip_blocks=True)


async def generate_scaffold(project_name: str, blueprint_content: dict) -> dict[str, str]:
    """Generate harness scaffold files from blueprint content.

    Returns: dict of {filepath: content}
    """
    env = _get_jinja_env()

    class _Blueprint:
        """Dot-access wrapper for blueprint dict."""

        def __init__(self, data: dict) -> None:
            self._data = data

        def __getattr__(self, name: str) -> str:
            return self._data.get(name, "") or ""

    context = {
        "project_name": project_name,
        "blueprint": _Blueprint(blueprint_content),
        "domains": _extract_domains(blueprint_content),
        "tech_stack_lower": (blueprint_content.get("tech_stack", "") or "").lower(),
    }

    template_mapping = {
        "AGENTS.md": "AGENTS.md.j2",
        "ARCHITECTURE.md": "ARCHITECTURE.md.j2",
        "docs/DESIGN.md": "DESIGN.md.j2",
        "docs/FRONTEND.md": "FRONTEND.md.j2",
        "docs/SECURITY.md": "SECURITY.md.j2",
        "docs/RELIABILITY.md": "RELIABILITY.md.j2",
        "docs/PLANS.md": "PLANS.md.j2",
        "docs/product-specs/index.md": "product-spec.md.j2",
        ".github/workflows/ci.yml": "github-ci.yml.j2",
        "docs/exec-plans/active/phase-1.md": "exec-plan.md.j2",
    }

    files: dict[str, str] = {}
    for output_path, template_name in template_mapping.items():
        try:
            template = env.get_template(template_name)
            files[output_path] = template.render(**context)
        except Exception as exc:
            logger.warning("Failed to render %s: %s", template_name, exc)
            files[output_path] = f"# {output_path}\n\nTemplate rendering failed. Please fill manually."

    # Scaffold directories
    files["docs/exec-plans/completed/.gitkeep"] = ""
    files["docs/design-docs/.gitkeep"] = ""
    files["linters/.gitkeep"] = ""
    files["scripts/.gitkeep"] = ""
    files["src/.gitkeep"] = ""

    return files


def _extract_domains(blueprint: dict) -> list[dict]:
    """Extract domain info from architecture section."""
    arch = blueprint.get("architecture", "") or ""
    domains = []
    for line in arch.split("\n"):
        if "|" in line and "---" not in line and "Domain" not in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 2:
                domains.append(
                    {
                        "name": parts[0],
                        "path": f"src/{parts[0].lower()}",
                        "purpose": parts[1] if len(parts) > 1 else "",
                    }
                )
    if not domains:
        domains.append({"name": "core", "path": "src/core", "purpose": "Main application logic"})
    return domains


async def create_github_repo(repo_name: str, files: dict[str, str], github_token: str) -> str:
    """Create a GitHub repo and push scaffold files. Returns repo URL."""
    import asyncio

    from github import Auth, Github, GithubException  # type: ignore[import-untyped]

    g = Github(auth=Auth.Token(github_token))
    user = g.get_user()
    logger.info("Authenticated as GitHub user: %s", user.login)

    # Create repo or use existing one
    try:
        repo = user.create_repo(repo_name, auto_init=True, private=True)
        logger.info("Created new repo: %s/%s", user.login, repo_name)
        # Wait for GitHub to initialize the repo
        await asyncio.sleep(3)
    except GithubException as e:
        if "already exists" in str(e).lower() or e.status == 422:
            repo = g.get_repo(f"{user.login}/{repo_name}")
            logger.info("Using existing repo: %s/%s", user.login, repo_name)
        else:
            raise

    # Push files one at a time using the simple Contents API
    for path, content in files.items():
        if not content:
            content = ""  # .gitkeep files
        try:
            repo.create_file(
                path=path,
                message=f"scaffold: add {path}",
                content=content,
                branch="main",
            )
        except GithubException as e:
            if e.status == 422 and "already exists" in str(e.data).lower():
                # File exists — update it
                existing = repo.get_contents(path, ref="main")
                repo.update_file(
                    path=path,
                    message=f"scaffold: update {path}",
                    content=content,
                    sha=existing.sha,
                    branch="main",
                )
            else:
                logger.warning("Failed to create file %s: %s", path, e)

    logger.info("Pushed %d scaffold files to %s", len(files), repo.html_url)
    return repo.html_url
