"""Code generation via AI provider abstraction — no CLI subprocess needed."""

import logging

from ..services.ai_provider import get_ai_client

logger = logging.getLogger(__name__)


async def run_agent(
    prompt: str, repo_context: str = "", model: str = "sonnet", org_id: str | None = None, db=None
) -> dict:
    """Call AI to generate code based on the prompt.

    Args:
        prompt: The task prompt
        repo_context: Optional repo structure for context
        model: "sonnet" (default, for implementation) or "haiku" (for investigation/review)
        org_id: Organization ID for provider routing
        db: Database session for provider config lookup

    Returns: {"success": bool, "output": str, "error": str | None, "files": dict[str, str]}
    """
    task = "default" if model == "sonnet" else "fast"

    system = (
        "You are a senior software engineer implementing a task. "
        "Output your implementation as a series of file changes.\n\n"
        "For each file you create or modify, use this exact format:\n"
        "```file:path/to/file.ext\n"
        "full file content here\n"
        "```\n\n"
        "Rules:\n"
        "- Write complete file contents, not diffs\n"
        "- Include all imports and dependencies\n"
        "- Follow best practices for the language\n"
        "- Write tests alongside implementation\n"
        "- Be thorough but concise\n"
    )

    if repo_context:
        system += f"\n\nExisting repo structure and key files:\n{repo_context}"

    try:
        ai = await get_ai_client(org_id, db, task=task) if db else await get_ai_client(None, db, task=task)
        output = await ai.chat(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=8192,
        )

        # Parse file blocks from output
        files = {}
        if "```file:" in output:
            parts = output.split("```file:")
            for part in parts[1:]:
                if "```" in part:
                    header_and_content = part.split("\n", 1)
                    filepath = header_and_content[0].strip()
                    content = header_and_content[1].split("```")[0] if len(header_and_content) > 1 else ""
                    if filepath:
                        files[filepath] = content

        return {
            "success": True,
            "output": output,
            "error": None,
            "files": files,
        }

    except Exception as exc:
        logger.error("AI call failed: %s", exc)
        return {"success": False, "output": "", "error": str(exc), "files": {}}
