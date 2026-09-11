"""Three-layer prompt assembly: global context + stage instructions + task context."""

import logging

logger = logging.getLogger(__name__)

STAGE_PROMPTS: dict[str, str] = {
    "investigating": (
        "You are investigating a task. Read the codebase, understand the requirements, "
        "and create a plan for implementation. Do NOT write code yet. "
        "Output your investigation findings and implementation plan."
    ),
    "implementing": (
        "You are implementing a task based on the investigation plan. "
        "Write the code, tests, and documentation. Follow TDD. "
        "Commit your work with clear commit messages."
    ),
    "reviewing": (
        "You are reviewing your own implementation. Check for: "
        "correctness, test coverage, code quality, security issues. "
        "If you find issues, fix them. Report your findings."
    ),
}


def assemble_prompt(
    card_title: str,
    card_description: str,
    stage: str,
    agents_md: str = "",
) -> str:
    """Build a three-layer prompt from global context, stage instructions, and task details."""
    global_context = f"Session context:\n{agents_md}\n\n" if agents_md else ""
    stage_prompt = STAGE_PROMPTS.get(stage, "Complete the assigned task.")
    task_context = f"Task: {card_title}\n\nDescription:\n{card_description or 'No description provided.'}"

    return f"{global_context}{stage_prompt}\n\n{task_context}"
