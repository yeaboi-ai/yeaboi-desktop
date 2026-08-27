"""Build facilitator prompts from session ai_config.

Used by both the current Deepgram+Claude worker and PersonaPlex worker.
"""

PERSONA_PROMPTS = {
    "default": "You are a sharp, opinionated senior engineer.",
    "pm": "You are an experienced product manager. Focus on user needs, feature prioritization, and market fit.",
    "architect": "You are a system architect. Focus on scalability, data models, API design, security, and infrastructure patterns.",
    "mentor": "You are a patient technical mentor. Explain concepts clearly, ask teaching questions. Be encouraging but thorough.",
    "challenger": "You are a devil's advocate. Question every assumption. Push back on easy answers. Stress-test ideas.",
}

ASSERTIVENESS_PROMPTS = {
    "passive": "Only respond when directly asked a question. Do not steer the conversation.",
    "balanced": "",
    "active": "Drive the conversation aggressively. Jump in with recommendations. Challenge weak ideas directly.",
}

BLUEPRINT_SECTIONS = [
    "project_overview",
    "goals_constraints",
    "users_personas",
    "tech_stack",
    "architecture",
    "api_integrations",
    "ui_ux",
    "security_compliance",
    "infrastructure",
    "open_questions",
]


def build_text_prompt(
    ai_config: dict,
    blueprint: dict | None = None,
    initial_idea: str | None = None,
) -> str:
    """Build a text prompt for the facilitator (PersonaPlex or Claude).

    Args:
        ai_config: Session AI configuration (persona, assertiveness, etc.)
        blueprint: Current blueprint state {section: content}
        initial_idea: The project's initial idea description
    """
    persona = ai_config.get("persona", "default")
    assertiveness = ai_config.get("assertiveness", "balanced")

    persona_text = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["default"])
    assertiveness_text = ASSERTIVENESS_PROMPTS.get(assertiveness, "")

    section_status = ""
    if blueprint:
        filled = [s for s in BLUEPRINT_SECTIONS if (blueprint.get(s) or "").strip()]
        empty = [s for s in BLUEPRINT_SECTIONS if s not in filled]
        section_status = (
            f"\n\nSections filled: {', '.join(filled) or 'none'}\nSections remaining: {', '.join(empty) or 'all done'}"
        )

    idea_context = ""
    if initial_idea:
        idea_context = f"\n\nProject idea: {initial_idea}"

    prompt = (
        f"{persona_text}\n\n"
        f"You are facilitating a collaborative planning session.{idea_context}\n\n"
        f"Guide the team through defining their project blueprint covering: "
        f"{', '.join(s.replace('_', ' ') for s in BLUEPRINT_SECTIONS)}.\n\n"
        f"Be concise — 1-2 sentences per response. Never output summaries, lists, or section headers. "
        f"The blueprint updates automatically — you do NOT write it in conversation.{section_status}"
    )

    if assertiveness_text:
        prompt = f"{prompt}\n\n{assertiveness_text}"

    return prompt
