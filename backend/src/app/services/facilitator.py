import json
import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas.blueprint import BLUEPRINT_SECTIONS
from .ai_provider import get_ai_client_for_role

logger = logging.getLogger(__name__)

# ─── Chat segment parsing ─────────────────────────────────────────────────────
# The LLM is instructed (see _RULES_ABSOLUTE) to split each reply into 1-2
# tagged segments: optional [ack] then required [next]. Each segment renders as
# its own chat bubble. parse_segments() splits the LLM's plain-text response
# (after code-fence blocks have been stripped) into a list of {type, content}.

_SEGMENT_TAG_RE = re.compile(r"^\s*\[(ack|next)\]\s*", re.IGNORECASE | re.MULTILINE)


def parse_segments(text: str) -> list[dict]:
    """Split a tagged chat response into ordered segments.

    Each segment is ``{"type": "ack" | "next", "content": str}``. If the LLM
    didn't emit any tags (legacy or malformed output), the whole text is
    returned as a single ``{"type": "next", "content": text}`` segment so the
    caller still has something to display. Empty segments are dropped.
    """
    if not text or not text.strip():
        return []

    matches = list(_SEGMENT_TAG_RE.finditer(text))
    if not matches:
        stripped = text.strip()
        return [{"type": "next", "content": stripped}] if stripped else []

    segments: list[dict] = []
    for idx, m in enumerate(matches):
        seg_type = m.group(1).lower()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            segments.append({"type": seg_type, "content": content})

    # If parser saw tags but every segment was empty, fall back to a single
    # 'next' so the chat doesn't go silent.
    if not segments:
        stripped = text.strip()
        if stripped:
            return [{"type": "next", "content": stripped}]
    return segments

# ─── Coverage Radar ───────────────────────────────────────────────────────────

# Keywords that indicate substantive coverage per section
_SECTION_KEYWORDS: dict[str, list[str]] = {
    "project_overview": ["build", "create", "app", "platform", "tool", "system"],
    "goals_constraints": ["goal", "constraint", "timeline", "deadline", "scope", "mvp"],
    "users_personas": ["user", "persona", "role", "audience", "customer", "developer"],
    "team_capacity": ["team", "developer", "engineer", "sprint", "velocity", "solo"],
    "architecture": ["component", "service", "layer", "pattern", "frontend", "backend", "api"],
    "tech_stack": ["react", "vue", "node", "python", "database", "postgresql", "firebase"],
    "api_integrations": ["api", "endpoint", "rest", "graphql", "webhook", "integration", "sdk"],
    "ui_ux": ["ui", "ux", "design", "layout", "responsive", "mobile", "dark mode"],
    "security_compliance": ["auth", "security", "encryption", "ssl", "gdpr", "compliance"],
    "infrastructure": ["deploy", "hosting", "aws", "vercel", "docker", "ci/cd", "cloud"],
    "risks_unknowns": ["risk", "unknown", "blocker", "challenge", "concern", "dependency"],
    "out_of_scope": ["out of scope", "not included", "excluded", "won't", "later", "v2"],
    "open_questions": ["question", "decide", "unclear", "tbd", "open", "?"],
}

SECTION_LABELS: dict[str, str] = {
    "project_overview": "Project Overview",
    "goals_constraints": "Goals & Constraints",
    "users_personas": "Users & Personas",
    "team_capacity": "Team & Capacity",
    "architecture": "Architecture",
    "tech_stack": "Tech Stack",
    "api_integrations": "API & Integrations",
    "ui_ux": "UI/UX",
    "security_compliance": "Security & Compliance",
    "infrastructure": "Infrastructure",
    "risks_unknowns": "Risks & Unknowns",
    "out_of_scope": "Out of Scope",
    "open_questions": "Open Questions",
}


def assess_coverage(blueprint: dict, sections_filter: list[str] | None = None) -> dict:
    """Score each blueprint section 0-100 based on content depth.

    Args:
        sections_filter: If provided, only score these sections (for iteration types).

    Returns: {scores: {section: int}, grade: str, overall: int, gaps: [str]}
    """
    scores: dict[str, int] = {}
    target_sections = sections_filter or BLUEPRINT_SECTIONS

    for section in target_sections:
        content = (blueprint.get(section) or "").strip()
        length = len(content)

        # Base score from content length
        if length == 0:
            score = 0
        elif length < 20:
            score = 20
        elif length < 50:
            score = 40
        elif length < 150:
            score = 60
        elif length < 300:
            score = 80
        else:
            score = 90

        # Keyword bonus: +10 if content contains section-relevant terms
        keywords = _SECTION_KEYWORDS.get(section, [])
        if keywords and content:
            lowered = content.lower()
            matches = sum(1 for kw in keywords if kw in lowered)
            if matches >= 2:
                score = min(100, score + 10)

        scores[section] = score

    overall = round(sum(scores.values()) / len(scores)) if scores else 0
    grade = "A" if overall >= 80 else "B" if overall >= 60 else "C" if overall >= 40 else "D"
    gaps = [s for s, sc in scores.items() if sc < 80]

    # Quality suggestions for gaps
    _SUGGESTIONS: dict[str, str] = {
        "project_overview": "Describe what the project does and who it's for",
        "goals_constraints": "Add goals, timeline, and constraints",
        "users_personas": "Define who uses this and their key needs",
        "team_capacity": "Add team size, sprint length, and velocity",
        "architecture": "Describe the system components and how they connect",
        "tech_stack": "Specify frontend, backend, and database choices",
        "api_integrations": "List APIs, SDKs, or third-party services",
        "ui_ux": "Describe the interface style and key screens",
        "security_compliance": "Note auth method, data protection, compliance needs",
        "infrastructure": "Specify hosting, deployment, and CI/CD approach",
        "risks_unknowns": "List blockers, concerns, or open risks",
        "out_of_scope": "Define what's explicitly excluded from this version",
        "open_questions": "Note unresolved decisions or questions",
    }
    suggestions = [
        {"section": s, "label": SECTION_LABELS.get(s, s), "suggestion": _SUGGESTIONS.get(s, "")} for s in gaps
    ]

    return {
        "scores": scores,
        "grade": grade,
        "overall": overall,
        "gaps": gaps,
        "suggestions": suggestions,
        "ready": overall >= 60,
    }


def _extract_session_focus(text: str) -> tuple[list[str] | None, str]:
    """Parse any ```session_focus blocks from the facilitator's response text.

    Returns:
        (sections | None, stripped_text)

    - `sections` is `None` if no valid block was found, otherwise the last valid
      block's `sections` list (filtered against BLUEPRINT_SECTIONS).
    - `stripped_text` is the response text with all session_focus blocks removed.

    An explicit `[]` resets the session to full scope. A missing block means
    "no change". A malformed block is dropped but still stripped from the text.
    """
    if "```session_focus" not in text:
        return None, text

    last_valid: list[str] | None = None
    text_parts: list[str] = []
    parts = text.split("```session_focus")
    text_parts.append(parts[0].strip())
    for part in parts[1:]:
        segments = part.split("```", 1)
        json_str = segments[0].strip()
        if len(segments) > 1:
            text_parts.append(segments[1].strip())
        try:
            update = json.loads(json_str)
            if isinstance(update.get("sections"), list):
                filtered = [s for s in update["sections"] if s in BLUEPRINT_SECTIONS]
                last_valid = filtered
        except json.JSONDecodeError:
            pass
    stripped = " ".join(p for p in text_parts if p).strip()
    return last_valid, stripped


PERSONA_FOCUS_SECTIONS: dict[str, list[str]] = {
    "default": ["tech_stack", "architecture", "infrastructure", "api_integrations"],
    "pm": ["project_overview", "goals_constraints", "users_personas", "ui_ux", "out_of_scope"],
    "architect": ["architecture", "tech_stack", "api_integrations", "infrastructure", "security_compliance"],
    "mentor": ["project_overview", "goals_constraints", "users_personas", "team_capacity", "open_questions"],
    "challenger": ["risks_unknowns", "goals_constraints", "out_of_scope", "security_compliance"],
}

PERSONA_LABELS: dict[str, str] = {
    "default": "Senior Engineer",
    "pm": "Product Manager",
    "architect": "System Architect",
    "mentor": "Patient Mentor",
    "challenger": "Devil's Advocate",
}


def compute_persona_suggestion(
    scores: dict[str, int],
    current_persona: str,
    custom_focus_sections: list[str] | None = None,
    *,
    focus_threshold: int = 95,
    used_personas: set[str] | list[str] | None = None,
) -> dict | None:
    """Decide whether to nudge the user toward switching personas.

    Mirrors the prompt-level `>>> DIRECTIVE: Suggest switching to ...` heuristic
    in :func:`_build_context_from_session_context` and :func:`process_message`.
    Returns a structured payload that the chat path can broadcast as a
    `suggest_persona` WS event (matching the voice agent's
    /api/internal/suggest-persona shape) — or ``None`` when no switch is
    warranted.

    A switch is suggested when:
      1. The current persona's focus sections are all at ``focus_threshold``%+
         (the persona's job is "done").
      2. At least one other persona has focus sections still below that bar.

    The chosen target is the persona with the most pending gaps. When ties
    occur, ``max`` picks the first by iteration order — stable enough for UX.

    ``used_personas`` (typically ``runtime_state["persona_history"]``) is
    hard-excluded so we never re-recommend a persona the user has already
    been. When every other persona has been used the function returns
    ``None`` — better silence than a credibility-killing re-pitch.
    """
    focus_sections = custom_focus_sections or PERSONA_FOCUS_SECTIONS.get(current_persona, [])
    if not focus_sections:
        return None

    focus_gaps = [s for s in focus_sections if scores.get(s, 0) < focus_threshold]
    if focus_gaps:
        # Current persona still has work; don't suggest switching yet.
        return None

    used = set(used_personas or [])
    used.add(current_persona)

    other_persona_gaps: dict[str, list[str]] = {}
    for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
        if p_id in used or not p_sections:
            continue
        p_gaps = [s for s in p_sections if scores.get(s, 0) < focus_threshold]
        if p_gaps:
            other_persona_gaps[p_id] = p_gaps

    if not other_persona_gaps:
        return None

    best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
    best_gaps = other_persona_gaps[best_persona]
    gap_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
    label = PERSONA_LABELS.get(best_persona, best_persona)
    return {
        "persona": best_persona,
        "label": label,
        "reason": f"to cover {', '.join(gap_labels)}",
        "gap_sections": best_gaps[:5],
    }


_OUTPUT_LABELS: dict[str, str] = {
    "code_scaffold": "Code scaffold",
    "design_bundle": "Design bundle",
    "terraform_stack": "Terraform stack",
    "decision_doc": "Decision doc",
}

_OUTPUT_REASONS: dict[str, str] = {
    "code_scaffold": "Tech stack, architecture, and infrastructure are all defined",
    "design_bundle": "UI/UX is well-developed",
    "terraform_stack": "Infrastructure and tech stack are defined",
    "decision_doc": "Overview, goals, and scope are clear",
}


def compute_output_suggestions(blueprint: dict) -> list[dict]:
    """Decide which output artifacts are now ready to generate.

    Returns one entry per fully-matured output type. The chat path broadcasts
    each as a `suggest_output` WS event; the frontend renders a small chip
    near the chat (mirroring the persona-switch chip pattern). The user
    accepts (→ POST /api/sessions/{id}/outputs/{type}/generate) or dismisses
    locally — no server-side dismissal tracking.

    Maturity is computed via :func:`output_maturity.maturity_for`. An output
    is "ready" at 100% (every required section has substantive content).
    """
    from .output_maturity import maturity_for

    suggestions: list[dict] = []
    for output_type, label in _OUTPUT_LABELS.items():
        score = maturity_for(output_type, blueprint)
        if score >= 100:
            suggestions.append(
                {
                    "output_type": output_type,
                    "label": label,
                    "reason": _OUTPUT_REASONS.get(output_type, ""),
                    "maturity": score,
                }
            )
    return suggestions


PERSONA_PROMPTS = {
    "default": (
        "You are a sharp, opinionated senior engineer. "
        "You think in terms of systems, trade-offs, and implementation. "
        "Your PRIMARY focus areas are: Tech Stack, Architecture, Infrastructure, "
        "and API & Integrations. Steer the conversation toward these sections "
        "when they have gaps. You CAN answer questions about other areas but "
        "always return to your focus areas if they're incomplete."
    ),
    "pm": (
        "You are an experienced product manager. You think in terms of USERS, not "
        "technology. Your PRIMARY focus areas are: Project Overview, Goals & "
        "Constraints, Users & Personas, UI/UX, and Out of Scope. NEVER ask about "
        "tech stack, frameworks, databases, or infrastructure — that's engineering's "
        "job. When the user mentions technical choices, acknowledge briefly and "
        "redirect to a product question (users, problem, MVP scope, differentiator, "
        "journey, success metric)."
    ),
    "architect": (
        "You are a system architect. You think in terms of components, "
        "boundaries, data flow, and scalability. Your PRIMARY focus areas are: "
        "Architecture, Tech Stack, API & Integrations, Infrastructure, and "
        "Security & Compliance. Focus on:\n"
        "- System decomposition: what are the services/layers?\n"
        "- Data models and relationships\n"
        "- API design and integration patterns\n"
        "- Security architecture and auth flows\n"
        "- Infrastructure and deployment topology\n"
        "- Performance, scaling, and reliability trade-offs\n"
        "Push for clear technical decisions. Draw architecture diagrams early."
    ),
    "mentor": (
        "You are a patient technical mentor. You cover ALL blueprint areas "
        "but at a teaching pace. You explain concepts clearly "
        "and ask teaching questions to help the team think through problems. "
        "When the user doesn't know something, explain it simply before "
        "asking them to decide. Use analogies. Be encouraging but thorough. "
        "Never assume knowledge — if they seem unsure, offer options with "
        "plain-English explanations of trade-offs."
    ),
    "challenger": (
        "You are a devil's advocate. Your PRIMARY focus areas are: Risks & "
        "Unknowns, Goals & Constraints, Out of Scope, and Security & Compliance. "
        "Question EVERY assumption. For every "
        "choice the user makes, ask 'why not X instead?' and present a "
        "concrete alternative. Push back on easy answers. If they say "
        "'React', ask why not Vue or Svelte. If they say 'MVP', ask what "
        "they'd cut. Stress-test ideas until they're bulletproof. Be "
        "respectful but relentless."
    ),
}

ASSERTIVENESS_PROMPTS = {
    "passive": (
        "Only respond when directly asked a question. Do not interject "
        "or steer the conversation. Wait for the user to lead."
    ),
    "balanced": "",  # Current default behavior — no extra instruction needed
    "active": (
        "Drive the conversation aggressively. Don't wait for the user "
        "to finish thoughts — jump in with recommendations. Challenge "
        "weak ideas directly. Keep the pace high."
    ),
}

# Adjusts how the facilitator handles technical jargon, based on the user's
# self-reported comfort level (set on session create, editable mid-session via
# ai_config). "comfortable" is the silent default; the other levels prepend a
# directive into the system prompt so the model adapts depth in-place.
TECHNICAL_COMFORT_PROMPTS = {
    "non_technical": (
        "TECHNICAL DEPTH: The user is NOT technical. Whenever you use a "
        "technical term (API, auth, webhook, schema, queue, CI/CD, microservice, "
        "JWT, OAuth, etc.), immediately follow it with a one-sentence "
        "plain-English explanation and a familiar real-world analogy. Don't "
        "ask 'do you want me to explain X?' — just do it inline. Prefer "
        "everyday words over jargon when both work equally well."
    ),
    "comfortable": "",  # Default — no extra instruction
    "expert": (
        "TECHNICAL DEPTH: The user is a senior engineer. Skip definitions of "
        "standard technical concepts. Be terse, assume deep knowledge, and go "
        "straight to the trade-offs."
    ),
}

_VALID_TECHNICAL_COMFORT = frozenset(TECHNICAL_COMFORT_PROMPTS.keys())


def normalise_technical_comfort(value: str | None) -> str:
    """Coerce arbitrary input to a valid technical_comfort level."""
    if value in _VALID_TECHNICAL_COMFORT:
        return value  # type: ignore[return-value]
    return "comfortable"

# ─── ARC Prompt Framework ─────────────────────────────────────────────────────
# Structured as: Actor (who you are) → Rules (how to behave) → Context (injected at runtime)
# This makes it easy to modify individual sections without breaking others.

_ACTOR = (
    "{persona_prompt} You are an AI facilitator in a collaborative planning session "
    "who DRIVES the conversation forward.\n\n"
    "{assertiveness_prompt}"
    "Your job: guide the team through building a project blueprint covering: {sections}\n"
)

_RULES_FACILITATION = (
    "\n## Facilitation\n"
    "- GAUGE COMPLEXITY from the first message. A portfolio site needs 3-5 questions. "
    "An enterprise SaaS needs thorough exploration of auth, data models, scaling, compliance.\n"
    "- SIMPLE projects: ask briefly about each area — don't assume. But STILL cover all sections.\n"
    "- COMPLEX projects: dig deep into data models, user roles, API boundaries, scaling, compliance.\n"
    "- Be OPINIONATED. State your recommendation in chat, let them push back.\n"
    "- If someone says 'figure it out' / 'sounds good' / 'your call', state your recommendation "
    "in chat FIRST. Only emit a blueprint_update AFTER they acknowledge or confirm it.\n"
    "- When YOUR focus areas are all 80%+ but OTHER gaps remain, a structured "
    "persona-switch suggestion chip is surfaced to the user automatically. Do NOT "
    "describe the switch in chat prose — the chip handles it. Just finish the current "
    "topic naturally (one short sentence) and let the chip do the asking.\n"
    "- NEVER quote a specific coverage percentage in chat — the blueprint panel "
    "shows the live score.\n"
    "- SESSION INTENT: when the user explicitly states they want to focus on a "
    'specific area ("start with UI", "let\'s plan the infrastructure", '
    '"I only want to think about goals today"), immediately emit a '
    "session_focus block listing the matching blueprint section keys. For the "
    "rest of the session, steer only toward those sections. If the user later "
    'expands the scope ("let\'s also cover auth"), emit an updated block with '
    "the broader list.\n"
    "- To reset the session to full-blueprint scope, emit an empty list: "
    '`{{"sections": [], "reason": "widen scope"}}`.\n'
    "- session_focus format (parsed automatically, never shown in chat):\n"
    "```session_focus\n"
    '{{"sections": ["ui_ux"], "reason": "user wants UI-only session"}}\n'
    "```\n"
)

_RULES_STEERING = (
    "\n## Conversation Steering\n"
    "- Fill the ENTIRE blueprint to high quality. Your context includes a Coverage "
    "Radar with per-section scores (0-100%). Target: every section at 80%+.\n"
    "- Sections below 50%: these are gaps — steer toward them.\n"
    "- Sections at 50-79%: these need more detail. Ask one more question to deepen.\n"
    "- Sections at 80%+: these are solid — move on.\n"
    "- Follow-up depth and question budget per persona are set by the PACE block "
    "in context. Obey it strictly — when the budget is spent, hand off instead "
    "of asking another question.\n"
    "- Steer naturally: 'Great, that covers the core features. What about tech stack?'\n"
    "- If the user mentions info for a different section, capture it immediately.\n\n"
    "## Persona Focus\n"
    "- You have PRIMARY focus areas listed in the Coverage Radar context. Prioritize "
    "gaps in YOUR focus areas first. Your bar is HIGHER than 80% — push for 95%+ "
    "on your own areas by asking detailed follow-up questions.\n"
    "- When YOUR focus areas are all 95%+ but other sections have gaps, the structured "
    "persona-switch chip will appear automatically. Do NOT relay or rephrase the "
    "switch in chat — the chip is the channel for that recommendation. Keep your "
    "reply to a one-line acknowledgement of whatever the user just said.\n"
    "- ALWAYS capture info for ANY section if the user mentions it, even outside "
    "your focus areas.\n"
    "- Do NOT refuse to discuss sections outside your focus, but gently steer back "
    "to your strengths after capturing the info.\n"
    "- NEVER re-ask about topics already captured in the blueprint. Before asking a "
    "question, check the 'Current blueprint state' in your context — if a section "
    "already has content about that topic, skip it and move to the next gap.\n"
    "- Stay in YOUR lane. Do NOT ask about sections outside your focus areas unless "
    "all your focus areas are at 95%+.\n\n"
    "Key sections to cover:\n"
    "- team_capacity: ask about team size (how many developers), sprint length "
    "(1-4 weeks), velocity (points/sprint). For solo devs, note '1 developer, "
    "no sprints' and move on quickly. Default: 5 pts/developer/sprint.\n"
    "- risks_unknowns: ask about blockers, technical risks, dependencies, "
    "unknowns. Even 'no major risks' is valid content.\n"
    "- out_of_scope: ask what's explicitly NOT included in this version. "
    "Helps set clear boundaries.\n"
)

_RULES_BLUEPRINT_UPDATES = (
    "\n## Blueprint Updates\n"
    "- Emit ```blueprint_update blocks (parsed automatically, never shown in chat).\n"
    "- EVERY response where you learn something new MUST include blueprint_update "
    "blocks. You can ask a follow-up question AND emit updates in the same response.\n"
    "- Examples of when to emit:\n"
    "  - User says 'solo' → update users_personas AND team_capacity\n"
    "  - User says 'web app' → update infrastructure\n"
    "  - User confirms your recommendation → update the relevant section\n"
    "  - User answers a question with facts → update immediately\n"
    "- CRITICAL: If your chat text mentions a decision or fact (e.g. 'personal "
    "productivity tool for one user'), you MUST emit a blueprint_update in that "
    "SAME response. Summarising without updating is a bug.\n"
    "- Confirmations: 'yes', 'yeah', 'sounds good', 'go with that', 'sure', slang, "
    "or picking between options you offered.\n"
    "- DOCUMENT UPLOADS: When a message contains [USER UPLOADED DOCUMENT], treat ALL "
    "facts as user-stated. Emit updates for EVERY relevant section immediately.\n"
    "- Direct user statements need no confirmation — emit right away.\n"
    "- NEVER populate based on unconfirmed assumptions.\n"
    "- Include source field: 'user_stated' or 'user_confirmed'.\n"
    "\n"
    "### Format — bullet-only, append-only\n"
    "- Updates APPEND to the section. Emit ONLY the NEW bullets discovered this "
    "turn — do NOT re-emit anything already shown in the current blueprint state "
    "above. The backend unions your bullets with the existing content and dedupes "
    "automatically; re-emitting is wasted tokens and risks duplicates.\n"
    "- `content` must be one or more lines, each starting with `- `, one concrete "
    "fact per line. Keep each bullet ≤ ~100 chars. No prose paragraphs.\n"
    "- State the fact directly. Never use prefixes like 'RESOLVED:', 'CONFIRMED:', "
    "'DECIDED:'.\n"
    "- If a new fact CONTRADICTS one specific existing bullet (e.g. 'team of 5' → "
    "'team of 3'), include an optional `supersedes` field with the verbatim text "
    "of the bullet being replaced (including its leading `- ` marker). Omit "
    "`supersedes` for pure additions.\n"
    "- If you learned nothing new for a section, do not emit a block for it.\n"
    "- Format:\n"
    "```blueprint_update\n"
    '{{"section": "tech_stack", "content": "- Next.js frontend\\n'
    '- FastAPI backend", "source": "user_confirmed"}}\n'
    "```\n"
    "- Multiple updates per response are encouraged. Batch one block per section.\n"
)

_RULES_OUTPUTS = (
    "\n## Outputs\n"
    "- The project can produce multiple output artifacts (code scaffold, design "
    "bundle, Terraform stack, decision doc). The user chooses which to generate "
    "from the output panel — you do NOT need to recite the menu.\n"
    "- Planning is continuous. Never tell the user they 'must complete' the "
    "blueprint before they can move on.\n"
    "- When an artifact becomes generatable, a structured suggestion CHIP is "
    "surfaced automatically. Do NOT mention scaffolds, design bundles, Terraform "
    "stacks, or decision docs in chat — the chip is the channel for that "
    "recommendation. Never use the retired phrase 'Complete and Generate Board'.\n"
)

_RULES_DIAGRAMS = (
    "\n## Diagrams\n"
    "- Auto-generate a user flow diagram after 3+ features are discussed.\n"
    "- Auto-generate an architecture diagram after tech stack is discussed.\n"
    "- Auto-generate an ERD if database/models are discussed.\n"
    "- Auto-generate a LOW-fidelity wireframe when the ui_ux section reaches ~80 characters or more "
    "of content with at least one concrete screen or layout mentioned; regenerate when ui_ux gains "
    "a new screen or significantly changes an existing one. HIGH-fidelity wireframes require the "
    "user to explicitly request enhance — do not auto-promote fidelity.\n"
    "- Generate at most ONE diagram per response. When multiple auto-triggers fire at once, "
    "prefer the wireframe if ui_ux just got a substantive blueprint_update; otherwise prefer "
    "in order: flow, architecture, ERD.\n"
    "- Include a brief sentence before the diagram.\n\n"
    "Diagram schemas (output EXACTLY one in a ```diagram block):\n\n"
    "ARCHITECTURE:\n"
    "```diagram\n"
    '{{"type": "architecture", "title": "...", '
    '"zones": [{{"id": "vpc1", "label": "VPC", '
    '"style": "dashed", "children": ["svc1", "db1"]}}, ...], '
    '"nodes": [{{"id": "svc1", "label": "Auth Service", '
    '"service": "ecs", "provider": "aws", '
    '"zoneId": "vpc1"}}, ...], '
    '"edges": [{{"from": "svc1", "to": "db1", '
    '"label": "reads", "style": "solid"}}, ...]}}\n'
    "```\n"
    "- Services: ec2, lambda, s3, rds, dynamodb, sqs, ecs, eks, fargate, cloudfront, "
    "api gateway, cognito, redis, postgresql, kafka, docker, kubernetes, nginx\n"
    "- provider: aws|gcp|azure|generic. Group into zones.\n\n"
    "ERD:\n"
    "```diagram\n"
    '{{"type": "erd", "title": "...", "tables": '
    '[{{"id": "users", "name": "users", "columns": '
    '[{{"name": "id", "type": "uuid", '
    '"isPrimaryKey": true}}, '
    '{{"name": "email", "type": "varchar(255)"}}, '
    '{{"name": "org_id", "type": "uuid", '
    '"isForeignKey": true, '
    '"references": "orgs.id"}}]}}, ...], '
    '"relationships": [{{"from": "users", '
    '"to": "orgs", "type": "many-to-one"}}, ...]}}\n'
    "```\n\n"
    "FLOW:\n"
    "```diagram\n"
    '{{"type": "flow", "title": "...", "nodes": '
    '[{{"id": "1", "label": "User signs up", '
    '"shape": "process"}}, '
    '{{"id": "2", "label": "Email verified?", '
    '"shape": "decision"}}, ...], '
    '"edges": [{{"from": "1", "to": "2", '
    '"label": "submits"}}, '
    '{{"from": "2", "to": "3", '
    '"label": "yes"}}, ...]}}\n'
    "```\n"
    "- shapes: process, decision, start, end, io, database, subprocess\n"
    "- Nodes can include optional 'technical' for API detail: "
    '{{"technical": {{"method": "POST", "endpoint": "/api/follows", "service": "user-service", "notes": "triggers email"}}}}\n'
    "- Only add technical detail when the user asks for it (e.g. 'add API detail', 'show the technical view').\n"
    "- If wireframe screens exist for the project, link flow nodes to their screens with 'screenId' matching the screen's id.\n"
    "- CRITICAL FLOW RULES:\n"
    "  1. Number node IDs sequentially: '1', '2', '3', etc.\n"
    "  2. Edges MUST ONLY go from lower ID to higher ID (e.g. '1'→'2', '2'→'3'). NEVER '3'→'1'.\n"
    "  3. NO backward/circular edges. If a user returns to a screen, END the flow — do NOT draw an edge back.\n"
    "  4. Decision nodes branch forward: both 'yes' and 'no' go to HIGHER numbered nodes.\n"
    "  5. The flow is a DAG (directed acyclic graph). No cycles, no loops, no return edges.\n"
    "  6. SUB-FLOWS: When detailing a step, create a SEPARATE connected chain of nodes (IDs like 'sub_create_1', 'sub_create_2'). "
    "These sub-flow nodes MUST have edges connecting them to each other (e.g. 'sub_create_1'→'sub_create_2'→'sub_create_3'). "
    "Do NOT connect them to the main flow — only to each other. "
    "Add 'subflowIds' to the parent node listing ALL the sub-flow node IDs. Example:\n"
    '  Parent: {{"id": "3", "label": "Create Todo", "shape": "process", "subflowIds": ["sub_create_1", "sub_create_2", "sub_create_3"]}}\n'
    '  Sub-flow nodes: {{"id": "sub_create_1", ...}}, {{"id": "sub_create_2", ...}}, {{"id": "sub_create_3", ...}}\n'
    '  Sub-flow edges: {{"from": "sub_create_1", "to": "sub_create_2"}}, {{"from": "sub_create_2", "to": "sub_create_3"}}\n'
    "  7. AUTO-EXTRACT: If a decision node has some branches as sub-flows and others still inline (3+ nodes), "
    "extract the inline ones too. Keep the main flow high-level — details belong in sub-flows.\n\n"
    "WIREFRAME:\n"
    "```diagram\n"
    '{{"type": "wireframe", "title": "...", '
    '"fidelity": "low", '
    '"screens": [{{"id": "home", "name": "Home", '
    '"device": "mobile", '
    '"html": "<div style=\'padding:16px;'
    "font-family:var(--font-family)'>"
    "<nav style='display:flex;"
    "justify-content:space-between;"
    "padding:12px 0;border-bottom:1px solid "
    "var(--color-border)'>"
    "<span style='font-weight:600;color:var(--color-text)'>"
    "AppName</span></nav>"
    "<h2 style='margin:20px 0 12px;"
    "font-size:20px;color:var(--color-text)'>Welcome</h2>"
    "<button style='width:100%;"
    "padding:14px;background:var(--color-accent);"
    "color:var(--color-on-accent);border:none;"
    "border-radius:8px;font-size:14px;"
    "font-weight:600;cursor:pointer'>"
    'Get Started</button></div>"}}], '
    '"flows": [{{"from": "home", '
    '"to": "signup", '
    '"trigger": "tap Get Started"}}]}}\n'
    "```\n"
    "- WIREFRAME: generate FULL HTML+inline CSS per screen. Root div MUST use width:100%;min-height:100%.\n"
    "- WIREFRAME tokens: ALL colours and fonts MUST use CSS variables — never hex literals or "
    "rgba(). The renderer injects --color-bg, --color-surface, --color-text, --color-text-muted, "
    "--color-primary, --color-accent, --color-on-accent, --color-border, --color-success, "
    "--color-warning, --color-error, --font-family, --radius-sm, --radius-md per session. "
    "Use these directly in inline style: e.g. background:var(--color-accent); "
    "color:var(--color-text); border:1px solid var(--color-border).\n"
    '- WIREFRAME fidelity: auto-gen uses fidelity:"low". fidelity:"high" only via enhance.\n'
    "- Sizes: mobile=390x844, tablet=820x1180, desktop=1440x900. "
    "Desktop: sidebar(220px)+content layout with flexbox. "
    "Mobile: single column.\n\n"
    "All diagrams: 5-10 nodes, no orphans, labels 2-3 words max.\n"
)

_RULES_ABSOLUTE = (
    "\n## Message Structure (split your reply into chat bubbles)\n"
    "Each reply is split into 1-2 TAGGED segments. Each segment renders as its own "
    "chat bubble in the UI, so the user can scan them independently.\n"
    "\n"
    "Tags (must appear on their own line at the start of each segment):\n"
    "- `[ack]` — brief acknowledgement of what the user just said. Use when you "
    "want to confirm something landed (e.g. 'Got it — solo dev'). Max 14 words. "
    "OPTIONAL — skip if you have nothing to acknowledge.\n"
    "- `[next]` — the substantive part: ONE question, OR ONE recommendation, OR a "
    "bold lead line + 2-4 bullets if you have multiple points. REQUIRED — every "
    "reply has exactly one `[next]` segment.\n"
    "\n"
    "Hard rules for the structure:\n"
    "- Total words across both segments ≤ 40, blocks excluded. Going over is a bug.\n"
    "- If you use `[ack]`, it appears FIRST. `[next]` always comes after.\n"
    "- Never write text before the first tag. The first character of the reply is `[`.\n"
    "- `[next]` is at most ONE of: (a) one short sentence, OR (b) `**bold lead.**` "
    "followed by 2-4 `- ` bullets, each ≤ 12 words. Pick one — don't mix prose + bullets.\n"
    "- BANNED FILLER (never write these — they announce instead of saying): "
    "'Here's the current X:', 'Based on what we've captured', 'Let me X', 'I'll X', "
    "'Going forward,', 'Now,'. Cut them — go straight to the content.\n"
    "- Ask at most ONE question per reply. Save the rest for later turns.\n"
    "\n"
    "Example reply (good):\n"
    "  [ack] Got it — exports & templates in scope for v1.\n"
    "  [next] When you click a tag, should it filter the list to matching notes?\n"
    "\n"
    "Example reply (also good, no ack needed):\n"
    "  [next] **Architecture is shaping up.**\n"
    "  - Single Next.js app on Vercel\n"
    "  - Postgres on Neon\n"
    "  - Email via Resend\n"
    "\n"
    "Other absolute rules:\n"
    "- ALWAYS write chat text BEFORE any code-fence blocks (blueprint_update, "
    "diagram, session_focus). Never respond with only blocks.\n"
    "- NEVER write section names like **PROJECT OVERVIEW:** as headers in your message.\n"
    "- NEVER say 'let me capture' or 'let me document' or 'let me finalize'.\n"
    "- NEVER use internal section keys (like users_personas, tech_stack, "
    "goals_constraints) in chat. Use natural language: 'users and personas', "
    "'tech stack', 'goals'. Section keys are for blueprint_update blocks ONLY.\n"
    "- Blueprint updates happen AUTOMATICALLY in the side panel. Do NOT write them in chat.\n"
    "- ALWAYS respond — never stay silent.\n"
)

_PROMPT_TEMPLATE = (
    _ACTOR
    + _RULES_FACILITATION
    + _RULES_STEERING
    + _RULES_BLUEPRINT_UPDATES
    + _RULES_OUTPUTS
    + _RULES_DIAGRAMS
    + _RULES_ABSOLUTE
)

# Default system prompt for backward compatibility
SYSTEM_PROMPT = _PROMPT_TEMPLATE.format(
    persona_prompt=PERSONA_PROMPTS["default"],
    assertiveness_prompt="",
    sections=", ".join(BLUEPRINT_SECTIONS),
)


LANGUAGE_NAMES = {
    "en": "English",
    "ar": "Egyptian Arabic dialect (العامية المصرية)",
    "zh": "Chinese",
    "nl": "Dutch",
    "fr": "French",
    "de": "German",
    "hi": "Hindi",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "pl": "Polish",
    "pt": "Portuguese",
    "ru": "Russian",
    "es": "Spanish",
    "tr": "Turkish",
    "uk": "Ukrainian",
}

# Tone instructions mirrored from the LiveKit voice worker (worker.py) so
# typed and spoken paths shape responses identically when ai_config.emotion
# is set. Voice agent replaces TTS speed/pitch with prompt-level styling
# because streaming TTS clients drop voice-settings parameters; chat does
# the same for consistency.
EMOTION_INSTRUCTIONS = {
    "happy": (
        "\nTONE: Be upbeat, enthusiastic, and encouraging. "
        "Use positive language, show excitement about their ideas, "
        "and celebrate progress. Sound genuinely delighted."
    ),
    "excited": (
        "\nTONE: Be highly energetic and animated. "
        "Show strong enthusiasm, use exclamations naturally, "
        "and convey urgency and passion about the project."
    ),
    "serious": (
        "\nTONE: Be direct, measured, and professional. "
        "No small talk, no filler words. Get straight to the point. "
        "Sound authoritative and focused."
    ),
    "calm": (
        "\nTONE: Be relaxed, steady, and reassuring. "
        "Use softening language and create a comfortable atmosphere. "
        "No rushing."
    ),
}


def _build_system_prompt(
    assertiveness: str = "balanced",
    persona: str = "default",
    sections_override: list[str] | None = None,
    custom_persona_prompt: str | None = None,
    language: str = "en",
    emotion: str | None = None,
    technical_comfort: str = "comfortable",
) -> str:
    """Build a system prompt tailored to the given assertiveness level and persona."""
    persona_text = custom_persona_prompt or PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["default"])
    assertiveness_text = ASSERTIVENESS_PROMPTS.get(assertiveness, "")
    if assertiveness_text:
        assertiveness_text += "\n\n"
    language_name = LANGUAGE_NAMES.get(language, language)
    language_text = (
        f"LANGUAGE: You MUST respond entirely in {language_name}. "
        f"All your responses, questions, and confirmations must be in {language_name}.\n\n"
        if language != "en"
        else ""
    )
    emotion_text = EMOTION_INSTRUCTIONS.get(emotion or "", "")
    if emotion_text:
        emotion_text = emotion_text.lstrip("\n") + "\n\n"
    comfort_text = TECHNICAL_COMFORT_PROMPTS.get(technical_comfort, "")
    if comfort_text:
        comfort_text += "\n\n"
    section_list = sections_override or BLUEPRINT_SECTIONS
    return _PROMPT_TEMPLATE.format(
        persona_prompt=persona_text,
        assertiveness_prompt=assertiveness_text + language_text + emotion_text + comfort_text,
        sections=", ".join(SECTION_LABELS.get(s, s) for s in section_list),
    )


async def _load_directory_context(
    team_id: str,
    db: AsyncSession,
    query: str = "",
    limit: int = 5,
) -> str:
    """Load a compact slice of the team's directory for prompt injection.

    When ``query`` is provided, uses the retrieval service to pull the
    overview plus the top-K entries most relevant to the query. When empty,
    returns the overview only (previous behaviour).

    Output is newline-prefixed so callers can append it directly.
    """
    from .directory_retrieval import format_for_prompt, retrieve_for_query

    # Use retrieval when we have a query, otherwise fall back to the
    # overview-only load (still via the retrieval module for consistency).
    entries = await retrieve_for_query(
        team_id=team_id,
        query=query,
        db=db,
        limit=limit,
        include_overview=True,
    )
    if not entries:
        return ""
    return "\n\n" + format_for_prompt(entries)


# Max characters lifted from each source when blending the directory query.
# Keeps retrieval tokenisation cheap and prevents any one source from
# dominating the ranking.
_QUERY_IDEA_MAX = 400
_QUERY_SUMMARY_MAX = 800
_QUERY_MESSAGES_MAX = 600
_QUERY_RECENT_MESSAGE_COUNT = 6


async def _build_directory_query(
    session_id: str | None,
    db: AsyncSession | None,
    initial_idea: str | None,
) -> str:
    """Blend the initial idea with session context (rolling summary + recent
    transcript) into a retrieval query.

    The team directory is retrieved via token overlap, so the query's vocabulary
    directly controls which entries surface. Early in a session only the idea
    is available, but as soon as the summariser runs we layer in whatever the
    team has actually been discussing — which usually drifts from the idea.
    """
    parts: list[str] = []
    if initial_idea:
        parts.append(initial_idea.strip()[:_QUERY_IDEA_MAX])

    if session_id and db:
        try:
            from .context_reader import get_recent_messages, get_session_summary

            summary = await get_session_summary(session_id, db)
            if summary:
                parts.append(summary.strip()[:_QUERY_SUMMARY_MAX])

            messages = await get_recent_messages(session_id, _QUERY_RECENT_MESSAGE_COUNT, db)
            if messages:
                joined = " ".join((m.get("content") or "").strip() for m in messages if m.get("content"))
                if joined:
                    parts.append(joined[:_QUERY_MESSAGES_MAX])
        except Exception as e:
            # Retrieval is a "nice to have"; never fail the facilitator if the
            # session context is missing or broken.
            logger.debug("Directory query blend fell back to idea only: %s", e)

    return " ".join(p for p in parts if p).strip()


async def _build_context_from_session_context(
    session_id: str,
    db: AsyncSession,
    initial_idea: str | None,
    iteration_context: str | None,
    team_id: str | None,
    org_id: str | None,
    persona: str,
    sections_override: list[str] | None,
) -> tuple[str, dict]:
    """Build facilitator context from unified session context.

    Returns (context_string, coverage_dict).
    """
    from .context_reader import get_session_directory, get_session_summary

    directory = await get_session_directory(session_id, db)
    summary = await get_session_summary(session_id, db)

    # Provide sensible defaults if no context exists yet
    if directory is None:
        import copy

        from .context_materialiser import EMPTY_DIRECTORY

        directory = copy.deepcopy(EMPTY_DIRECTORY)

    # ── Compute coverage from directory's blueprint_coverage scores ──
    bp_coverage = directory.get("blueprint_coverage", {})
    target_sections = sections_override or BLUEPRINT_SECTIONS
    scores: dict[str, int] = {}
    for section in target_sections:
        scores[section] = bp_coverage.get(section, 0)

    overall = round(sum(scores.values()) / len(scores)) if scores else 0
    grade = "A" if overall >= 80 else "B" if overall >= 60 else "C" if overall >= 40 else "D"
    gaps = [s for s, sc in scores.items() if sc < 80]

    # ── Build context parts ──
    parts: list[str] = []

    if initial_idea:
        parts.append(f"Project initial idea: {initial_idea}")

    if iteration_context:
        parts.append(iteration_context)

    # Team directory context — blend the initial idea with the rolling session
    # summary + recent messages so retrieval drifts with the conversation.
    if team_id and db:
        try:
            query = await _build_directory_query(session_id, db, initial_idea)
            dir_context = await _load_directory_context(team_id, db, query=query)
            if dir_context:
                parts.append(dir_context.strip())
        except Exception as e:
            logger.warning("[FACILITATOR] Failed to load directory context: %s", e)

    # Vocabulary hints
    if org_id and db:
        try:
            from .vocabulary_service import get_vocabulary_for_transcription

            vocab = await get_vocabulary_for_transcription(org_id, None, db)
            vocab_hints = vocab.to_enhancement_context()
            if vocab_hints:
                vocab_block = (
                    "VOCABULARY — use these EXACT spellings when referring to these names/terms:\n"
                    + "\n".join(f"- {t}" for t in vocab_hints)
                )
                parts.append(vocab_block)
        except Exception as e:
            logger.warning("[FACILITATOR] Failed to load vocabulary: %s", e)

    # Session directory JSON (compact structured context)
    parts.append(f"SESSION DIRECTORY:\n{json.dumps(directory, indent=2)}")

    # Rolling summary
    if summary:
        parts.append(f"SESSION SUMMARY (rolling):\n{summary}")

    # ── Coverage steering lines (same logic as existing path) ──
    coverage_lines = [f"Blueprint coverage: {overall}% (grade {grade})"]

    FOCUS_THRESHOLD = 95
    OTHER_THRESHOLD = 80

    # Look up custom focus sections if org+persona available
    custom_focus_sections = None
    if org_id and db and persona:
        try:
            from ..services.blueprint_template_service import get_persona_prompt_and_focus

            _, custom_focus_sections = await get_persona_prompt_and_focus(org_id, persona, db)
        except Exception:
            pass

    focus_sections = custom_focus_sections or PERSONA_FOCUS_SECTIONS.get(persona, [])
    if focus_sections:
        focus_gaps = [s for s in focus_sections if scores.get(s, 0) < FOCUS_THRESHOLD]
        if focus_gaps:
            coverage_lines.append(f"YOUR focus areas (target {FOCUS_THRESHOLD}%+ — push for depth):")
            for s in focus_gaps:
                label = SECTION_LABELS.get(s, s)
                coverage_lines.append(f"  - {label} ({scores[s]}%) — needs more detail")

    other_gaps = [s for s in gaps if s not in focus_sections] if focus_sections else gaps
    if other_gaps:
        coverage_lines.append("Other low-confidence sections:")
        for s in other_gaps:
            label = SECTION_LABELS.get(s, s)
            coverage_lines.append(f"  - {label} ({scores[s]}%)")
        if focus_sections:
            other_persona_hints = []
            for s in other_gaps:
                for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
                    if p_id != persona and s in p_sections:
                        p_label = {
                            "default": "Engineer",
                            "pm": "Product Manager",
                            "architect": "Architect",
                            "challenger": "Challenger",
                            "mentor": "Mentor",
                        }.get(p_id, p_id)
                        other_persona_hints.append(f"{SECTION_LABELS.get(s, s)} → {p_label}")
                        break
            if other_persona_hints:
                coverage_lines.append(
                    "Hint: suggest the user switch personas to cover these: " + ", ".join(other_persona_hints)
                )

    well_covered = [s for s in BLUEPRINT_SECTIONS if scores.get(s, 0) >= 80]
    if well_covered:
        covered_labels = ", ".join(SECTION_LABELS.get(s, s) for s in well_covered)
        coverage_lines.append(f"Well-covered (80%+): {covered_labels}")
        coverage_lines.append(
            f"IMPORTANT: Do NOT re-ask about these covered topics: {covered_labels}. "
            "They are already answered — move on to unfilled sections only."
        )
    coverage_lines.append("")

    # Hard directive
    all_gaps = [s for s in BLUEPRINT_SECTIONS if scores.get(s, 0) < OTHER_THRESHOLD]
    focus_gaps_remaining = [s for s in focus_sections if scores.get(s, 0) < FOCUS_THRESHOLD] if focus_sections else []
    focus_done = focus_sections and not focus_gaps_remaining

    other_persona_gaps: dict[str, list[str]] = {}
    if focus_done:
        for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
            if p_id != persona and p_sections:
                p_gaps = [s for s in p_sections if scores.get(s, 0) < FOCUS_THRESHOLD]
                if p_gaps:
                    other_persona_gaps[p_id] = p_gaps

    if focus_gaps_remaining:
        gap_labels = [SECTION_LABELS.get(s, s) for s in focus_gaps_remaining[:3]]
        coverage_lines.append(
            f">>> DIRECTIVE: Your focus areas still need work. "
            f"Push these to {FOCUS_THRESHOLD}%+: {', '.join(gap_labels)}. "
            f"Do NOT suggest completing or say blueprint is solid."
        )
    elif all_gaps:
        gap_labels = [SECTION_LABELS.get(s, s) for s in all_gaps[:3]]
        if focus_done and other_persona_gaps:
            best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
            best_gaps = other_persona_gaps[best_persona]
            p_label = {
                "default": "Senior Engineer",
                "pm": "Product Manager",
                "architect": "System Architect",
                "challenger": "Devil's Advocate",
                "mentor": "Patient Mentor",
            }.get(best_persona, "another persona")
            best_gap_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
            coverage_lines.append(
                f">>> DIRECTIVE: Your focus areas are complete. Suggest switching to "
                f"{p_label} in AI Settings to cover: {', '.join(best_gap_labels)}. "
                f"Do NOT say the blueprint is ready."
            )
        else:
            coverage_lines.append(
                f">>> DIRECTIVE: Grade is {grade} ({overall}%). "
                f"NOT ready. Ask about: {', '.join(gap_labels)}. "
                f"Do NOT suggest completing or say blueprint is solid."
            )
    elif focus_done and other_persona_gaps:
        best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
        best_gaps = other_persona_gaps[best_persona]
        p_label = {
            "default": "Senior Engineer",
            "pm": "Product Manager",
            "architect": "System Architect",
            "challenger": "Devil's Advocate",
            "mentor": "Patient Mentor",
        }.get(best_persona, "another persona")
        best_gap_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
        coverage_lines.append(
            f">>> DIRECTIVE: Your focus areas are at {FOCUS_THRESHOLD}%+ — great work. "
            f"But {p_label} still has sections to deepen: {', '.join(best_gap_labels)}. "
            f"Suggest switching to {p_label} in AI Settings. Do NOT say blueprint is ready to build."
        )

    parts.append("\n".join(coverage_lines))

    # Retrieval tool instructions
    parts.append(
        "RETRIEVAL: If you need full content for a section or artifact, "
        "emit [GET_SECTION:section_name] or [GET_ARTIFACT:artifact_id] in your response."
    )

    context = "\n\n".join(parts)
    cov = {"scores": scores, "grade": grade, "overall": overall, "gaps": gaps}
    return context, cov


async def process_message(
    messages_history: list[dict],
    current_blueprint: dict,
    initial_idea: str | None = None,
    assertiveness: str = "balanced",
    persona: str = "default",
    org_id: str | None = None,
    db: AsyncSession | None = None,
    team_id: str | None = None,
    iteration_context: str | None = None,
    sections_override: list[str] | None = None,
    stream_callback=None,
    language: str = "en",
    session_id: str | None = None,
    emotion: str | None = None,
    bullet_focus: list[str] | None = None,
    pace: str | None = None,
    runtime_state: dict | None = None,
    technical_comfort: str = "comfortable",
) -> dict:
    """Process a chat message and return AI response + blueprint updates + session focus.

    ``pace`` + ``runtime_state`` come from the session's ``ai_config`` and
    ``agent_runtime_state`` JSON columns. They control how aggressively the
    facilitator should hand off to another persona — see services/pace.py.
    The returned dict carries an updated ``runtime_state`` that the caller
    must persist back to the session.

    Returns:
        {
            "response": str | None,  # AI text response (None if no_response)
            "blueprint_updates": [{"section": str, "content": str}, ...],
            "session_focus": list[str] | None,  # Section focus filter (None = no change, [] = reset to full)
            "meta": {"model": str, "latency_ms": int} | None,  # populated when an AI call ran
            "persona_suggestion": dict | None,
            "output_suggestions": list[dict],
            "runtime_state": dict | None,  # updated per-persona counters; persist to session.agent_runtime_state
        }
    """
    from .pace import (
        build_pace_directive,
        get_persona_history,
        get_persona_stats,
        next_persona_for_handoff,
        record_agent_reply,
        record_suggestion_fired,
        should_resurface_suggestion,
    )
    # Look up custom persona from DB (if available)
    custom_persona_prompt = None
    custom_focus_sections = None
    if org_id and db and persona:
        try:
            from ..services.blueprint_template_service import get_persona_prompt_and_focus

            custom_persona_prompt, custom_focus_sections = await get_persona_prompt_and_focus(org_id, persona, db)
        except Exception:
            pass  # Fall back to hardcoded

    # Build context — new session-context path or legacy path
    from ..config import get_settings

    settings = get_settings()

    if settings.use_session_context and session_id and db:
        context, cov = await _build_context_from_session_context(
            session_id=session_id,
            db=db,
            initial_idea=initial_idea,
            iteration_context=iteration_context,
            team_id=team_id,
            org_id=org_id,
            persona=persona,
            sections_override=sections_override,
        )
        gaps = cov["gaps"]
        scores = cov["scores"]
    else:
        # Legacy context assembly — score each section and build steering context
        cov = assess_coverage(current_blueprint, sections_filter=sections_override)
        gaps = cov["gaps"]
        scores = cov["scores"]

        coverage_lines = [f"Blueprint coverage: {cov['overall']}% (grade {cov['grade']})"]

        # Persona-specific focus — personas must push their own areas to 95%+
        # Other areas only need 80%
        FOCUS_THRESHOLD = 95
        OTHER_THRESHOLD = 80
        focus_sections = custom_focus_sections or PERSONA_FOCUS_SECTIONS.get(persona, [])
        # When the session is scoped (sections_override present), `scores` only contains
        # in-scope sections. Persona focus sections that are out-of-scope must be
        # filtered out, otherwise scores[s] raises KeyError.
        if sections_override is not None:
            focus_sections = [s for s in focus_sections if s in scores]
        if focus_sections:
            focus_gaps = [s for s in focus_sections if scores.get(s, 0) < FOCUS_THRESHOLD]
            if focus_gaps:
                coverage_lines.append(f"YOUR focus areas (target {FOCUS_THRESHOLD}%+ — push for depth):")
                for s in focus_gaps:
                    label = SECTION_LABELS.get(s, s)
                    coverage_lines.append(f"  - {label} ({scores.get(s, 0)}%) — needs more detail")

        # Other gaps outside this persona's domain
        other_gaps = [s for s in gaps if s not in focus_sections] if focus_sections else gaps
        if other_gaps:
            coverage_lines.append("Other low-confidence sections:")
            for s in other_gaps:
                label = SECTION_LABELS.get(s, s)
                coverage_lines.append(f"  - {label} ({scores.get(s, 0)}%)")
            if focus_sections:
                # Map sections to personas that cover them
                other_persona_hints = []
                for s in other_gaps:
                    for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
                        if p_id != persona and s in p_sections:
                            p_label = {
                                "default": "Engineer",
                                "pm": "Product Manager",
                                "architect": "Architect",
                                "challenger": "Challenger",
                                "mentor": "Mentor",
                            }.get(p_id, p_id)
                            other_persona_hints.append(f"{SECTION_LABELS.get(s, s)} → {p_label}")
                            break
                if other_persona_hints:
                    coverage_lines.append(
                        "Hint: suggest the user switch personas to cover these: " + ", ".join(other_persona_hints)
                    )

        well_covered = [s for s in BLUEPRINT_SECTIONS if scores.get(s, 0) >= 80]
        if well_covered:
            covered_labels = ", ".join(SECTION_LABELS.get(s, s) for s in well_covered)
            coverage_lines.append(f"Well-covered (80%+): {covered_labels}")
            coverage_lines.append(
                f"IMPORTANT: Do NOT re-ask about these covered topics: {covered_labels}. "
                "They are already answered — move on to unfilled sections only."
            )
        coverage_lines.append("")

        # Hard directive — injected at the end of context for maximum attention
        all_gaps = [s for s in BLUEPRINT_SECTIONS if scores.get(s, 0) < OTHER_THRESHOLD]
        focus_gaps_remaining = (
            [s for s in focus_sections if scores.get(s, 0) < FOCUS_THRESHOLD] if focus_sections else []
        )
        focus_done = focus_sections and not focus_gaps_remaining

        # Check if OTHER personas still have work to do (their sections below 95%)
        other_persona_gaps: dict[str, list[str]] = {}
        if focus_done:
            for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
                if p_id != persona and p_sections:
                    p_gaps = [s for s in p_sections if scores.get(s, 0) < FOCUS_THRESHOLD]
                    if p_gaps:
                        other_persona_gaps[p_id] = p_gaps

        if focus_gaps_remaining:
            # This persona still has work — keep going
            gap_labels = [SECTION_LABELS.get(s, s) for s in focus_gaps_remaining[:3]]
            coverage_lines.append(
                f">>> DIRECTIVE: Your focus areas still need work. "
                f"Push these to {FOCUS_THRESHOLD}%+: {', '.join(gap_labels)}. "
                f"Do NOT suggest completing or say blueprint is solid."
            )
        elif all_gaps:
            # Basic sections below 80% — keep going
            gap_labels = [SECTION_LABELS.get(s, s) for s in all_gaps[:3]]
            if focus_done and other_persona_gaps:
                best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
                best_gaps = other_persona_gaps[best_persona]
                p_label = {
                    "default": "Senior Engineer",
                    "pm": "Product Manager",
                    "architect": "System Architect",
                    "challenger": "Devil's Advocate",
                    "mentor": "Patient Mentor",
                }.get(best_persona, "another persona")
                best_gap_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
                coverage_lines.append(
                    f">>> DIRECTIVE: Your focus areas are complete. Suggest switching to "
                    f"{p_label} in AI Settings to cover: {', '.join(best_gap_labels)}. "
                    f"Do NOT say the blueprint is ready."
                )
            else:
                coverage_lines.append(
                    f">>> DIRECTIVE: Grade is {cov['grade']} ({cov['overall']}%). "
                    f"NOT ready. Ask about: {', '.join(gap_labels)}. "
                    f"Do NOT suggest completing or say blueprint is solid."
                )
        elif focus_done and other_persona_gaps:
            # Grade is A (all ≥80%) but other personas have sections below 95%
            best_persona = max(other_persona_gaps, key=lambda p: len(other_persona_gaps[p]))
            best_gaps = other_persona_gaps[best_persona]
            p_label = {
                "default": "Senior Engineer",
                "pm": "Product Manager",
                "architect": "System Architect",
                "challenger": "Devil's Advocate",
                "mentor": "Patient Mentor",
            }.get(best_persona, "another persona")
            best_gap_labels = [SECTION_LABELS.get(s, s) for s in best_gaps[:3]]
            coverage_lines.append(
                f">>> DIRECTIVE: Your focus areas are at {FOCUS_THRESHOLD}%+ — great work. "
                f"But {p_label} still has sections to deepen: {', '.join(best_gap_labels)}. "
                f"Suggest switching to {p_label} in AI Settings. Do NOT say blueprint is ready to build."
            )

        # Convert blueprint keys to human-readable labels so AI doesn't leak underscored keys
        readable_blueprint = {SECTION_LABELS.get(k, k): v for k, v in current_blueprint.items()}
        context = "\n".join(coverage_lines) + f"\nCurrent blueprint state:\n{json.dumps(readable_blueprint, indent=2)}"
        if initial_idea:
            context = f"Project initial idea: {initial_idea}\n\n{context}"

        # Inject iteration context for v2+ sessions
        if iteration_context:
            context = f"{iteration_context}\n\n{context}"

        # Inject team directory context — blend the initial idea with the
        # rolling session summary + recent messages when session context is
        # available, falling back to idea-only on the legacy path.
        if team_id and db:
            try:
                dir_query = await _build_directory_query(session_id, db, initial_idea)
                dir_context = await _load_directory_context(team_id, db, query=dir_query)
                if dir_context:
                    context = dir_context + "\n" + context
            except Exception as e:
                logger.warning("[FACILITATOR] Failed to load directory context: %s", e)

        # Inject vocabulary terms so AI uses correct spellings
        if org_id and db:
            try:
                from .vocabulary_service import get_vocabulary_for_transcription

                vocab = await get_vocabulary_for_transcription(org_id, None, db)
                vocab_hints = vocab.to_enhancement_context()
                if vocab_hints:
                    vocab_block = (
                        "VOCABULARY — use these EXACT spellings when referring to these names/terms:\n"
                        + "\n".join(f"- {t}" for t in vocab_hints)
                    )
                    context = vocab_block + "\n\n" + context
            except Exception as e:
                logger.warning("[FACILITATOR] Failed to load vocabulary: %s", e)

        # Inject wireframe state — without this, the facilitator answers
        # "improve the screens" with "I don't see any wireframes" because
        # it never gets visibility into diagram_state.
        if session_id and db:
            try:
                from sqlalchemy import select as _select

                from ..models.session import Session as _Session
                from ..routers.sessions import _format_wireframe_summary

                _row = await db.execute(_select(_Session.diagram_state).where(_Session.id == session_id))
                _state = _row.scalar_one_or_none()
                _wf_summary = _format_wireframe_summary(_state)
                if _wf_summary:
                    context = (
                        f"WIREFRAMES IN THIS SESSION:\n{_wf_summary}\n\n"
                        "When the user says 'improve the screens', 'add a screen', or "
                        "'change X', they mean these surfaces. Reuse the same device "
                        "for any new ones so the set stays coherent.\n\n"
                        "WHEN PROPOSING NEW UI SURFACES — be explicit about kind:\n"
                        "  • Full screens have their own URL/route (Dashboard, Settings, Profile).\n"
                        "  • Modals overlay a parent screen for ephemeral edit/confirm/detail views.\n"
                        "  • Drawers slide in from the side for navigation menus, filters, settings panels.\n"
                        "  • Popovers anchor to a trigger element for small contextual menus.\n"
                        "If you suggest 'I'll add a settings drawer' or 'Task detail modal', the canvas "
                        "will mirror your wording — so be deliberate about whether something is a "
                        "screen or an overlay, and name what triggers each overlay (e.g. 'Settings drawer "
                        "opening from the avatar menu'). Don't say 'screen' if you mean modal.\n\n" + context
                    )
            except Exception as e:
                logger.warning("[FACILITATOR] Failed to load wireframe summary: %s", e)

    # Pace block — caps how many questions this persona asks before being
    # nudged to hand off. See services/pace.py for budget bundles. Prepended
    # so the LLM sees the budget BEFORE the conversation history; this avoids
    # the model treating the rule as just-another-coverage-line.
    persona_stats = get_persona_stats(runtime_state, persona)
    persona_label_for_pace = PERSONA_LABELS.get(persona, persona)
    # Used-persona memory — hard-excludes anyone who has been active this
    # session from handoff candidates so the chip never re-pitches a persona
    # the user already cycled through.
    used_personas_list = get_persona_history(runtime_state)
    pace_handoff = next_persona_for_handoff(
        scores=scores,
        current_persona=persona,
        persona_stats=persona_stats,
        pace=pace,
        persona_focus_sections=PERSONA_FOCUS_SECTIONS,
        persona_labels=PERSONA_LABELS,
        section_labels=SECTION_LABELS,
        used_personas=used_personas_list,
    )
    pace_directive = build_pace_directive(
        pace=pace,
        persona_label=persona_label_for_pace,
        persona_stats=persona_stats,
        next_persona_label=pace_handoff["label"] if pace_handoff else None,
        gap_section_labels=(
            [SECTION_LABELS.get(s, s) for s in pace_handoff["gap_sections"]] if pace_handoff else None
        ),
    )
    context = pace_directive + "\n\n" + context

    # Tell the LLM which personas have already been active so it doesn't
    # verbally re-pitch them in chat. The chip is suppressed below via
    # used_personas, but without this hint the model could still write
    # "you should try the PM" when the PM has already had a full turn.
    used_personas_for_prompt = [p for p in used_personas_list if p != persona]
    if used_personas_for_prompt:
        used_labels = ", ".join(PERSONA_LABELS.get(p, p) for p in used_personas_for_prompt)
        used_block = (
            f"PERSONAS ALREADY USED THIS SESSION: {used_labels}. "
            "Do NOT suggest switching to any of these — they've each had their turn. "
            "If all other personas are exhausted, finish the gaps yourself."
        )
        context = used_block + "\n\n" + context

    # Coverage-aware launcher: when the user selected specific bullets to
    # deep-dive into, prepend a directive so the facilitator steers questions
    # at exactly those bullets instead of broad section-level discovery.
    if bullet_focus:
        # Trim to keep the prompt focused; 8 bullets is plenty for a session
        # and avoids ballooning the context if the caller passes many.
        bullets_block = "\n".join(f"- {b.strip()}" for b in bullet_focus[:8] if b and b.strip())
        if bullets_block:
            context = (
                "DEEP DIVE — the user picked these specific points to expand. "
                "Ground every question and update in these bullets first; only branch out "
                "once they're fleshed out:\n"
                f"{bullets_block}\n\n"
            ) + context

    # Convert message history to provider-agnostic format
    api_messages = []
    for msg in messages_history[-20:]:  # Last 20 messages for context
        role = "assistant" if msg.get("message_type") in ("ai", "voice_ai") else "user"
        name = msg.get("user_name", "Unknown")
        content = f"[{name}]: {msg['content']}" if role == "user" else msg["content"]
        api_messages.append({"role": role, "content": content})

    # Ensure messages alternate and start with user
    if not api_messages or api_messages[0]["role"] != "user":
        api_messages.insert(0, {"role": "user", "content": "[System]: Session started."})

    # Merge consecutive same-role messages
    merged = []
    for msg in api_messages:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n" + msg["content"]
        else:
            merged.append(msg)

    import time as _time

    meta: dict | None = None
    try:
        ai = await get_ai_client_for_role(
            org_id if db else None,
            db,
            "chat",
            session_id=session_id,
        )
        system_prompt = _build_system_prompt(
            assertiveness,
            persona,
            sections_override=sections_override,
            custom_persona_prompt=custom_persona_prompt,
            language=language,
            emotion=emotion,
            technical_comfort=normalise_technical_comfort(technical_comfort),
        )
        logger.info("[FACILITATOR] Calling AI (%s/%s) with %s messages", ai.provider, ai.model, len(merged))
        _started = _time.monotonic()
        if stream_callback:
            text = ""
            full_system = system_prompt + "\n\n" + context
            async for token in ai.chat_stream(system=full_system, messages=merged, max_tokens=2048):
                # chat_stream now also yields ('usage', {...}) and
                # ('thinking', text) tuples — facilitator only consumes
                # plain text deltas, so filter out non-string events.
                if not isinstance(token, str):
                    continue
                text += token
                await stream_callback(token)
        else:
            text = await ai.chat(
                system=system_prompt + "\n\n" + context,
                messages=merged,
                max_tokens=2048,
            )
        latency_ms = int((_time.monotonic() - _started) * 1000)
        meta = {"model": ai.model, "latency_ms": latency_ms}
        logger.info(
            "[FACILITATOR] Response received, length: %s, latency_ms=%s",
            len(text),
            latency_ms,
        )
    except Exception as e:
        logger.error("[FACILITATOR] API ERROR: %s", e, exc_info=True)
        return {
            "response": None,
            "segments": [],
            "blueprint_updates": [],
            "session_focus": None,
            "meta": None,
            "persona_suggestion": None,
            "output_suggestions": [],
            "runtime_state": runtime_state,
        }

    # text is already a string from AIClient.chat()

    # Check for no_response
    if '"no_response": true' in text or '"no_response":true' in text:
        logger.debug("Claude said no_response — returning None")
        no_resp_suggestion = pace_handoff or compute_persona_suggestion(
            scores, persona, custom_focus_sections, used_personas=used_personas_list,
        )
        # Cooldown — drop the chip silently if we just suggested the same
        # persona within the cooldown window. Avoids spam on rapid replies.
        if no_resp_suggestion and not should_resurface_suggestion(runtime_state, no_resp_suggestion["persona"]):
            no_resp_suggestion = None
        no_resp_state = record_suggestion_fired(
            runtime_state, no_resp_suggestion["persona"] if no_resp_suggestion else None,
        )
        return {
            "response": None,
            "segments": [],
            "blueprint_updates": [],
            "session_focus": None,
            "meta": meta,
            "persona_suggestion": no_resp_suggestion,
            "output_suggestions": compute_output_suggestions(current_blueprint),
            "runtime_state": no_resp_state,
        }

    # Extract blueprint updates — collect text from before, between, and after blocks
    blueprint_updates = []
    if "```blueprint_update" in text:
        text_parts = []
        parts = text.split("```blueprint_update")
        text_parts.append(parts[0].strip())
        for part in parts[1:]:
            # Split on the closing ``` — JSON is before it, text after
            segments = part.split("```", 1)
            json_str = segments[0].strip()
            if len(segments) > 1:
                text_parts.append(segments[1].strip())
            try:
                update = json.loads(json_str)
                if "section" in update and "content" in update and update["section"] in BLUEPRINT_SECTIONS:
                    valid_sources = ("user_stated", "user_confirmed", "ai_recommended")
                    if update.get("source") not in valid_sources:
                        update["source"] = "user_stated"
                    blueprint_updates.append(update)
            except json.JSONDecodeError:
                pass
        text = " ".join(p for p in text_parts if p).strip()
    else:
        text = text.strip()

    session_focus, text = _extract_session_focus(text)

    # Strip ```diagram blocks from chat text (diagrams are extracted separately)
    if "```diagram" in text:
        diagram_parts = []
        segments = text.split("```diagram")
        diagram_parts.append(segments[0].strip())
        for seg in segments[1:]:
            closing = seg.split("```", 1)
            if len(closing) > 1:
                diagram_parts.append(closing[1].strip())
        text = " ".join(p for p in diagram_parts if p).strip()

    # Strip raw diagram JSON that leaked without code fences
    import re

    text = re.sub(
        r'\{"type"\s*:\s*"(architecture|flow|erd|wireframe)"[^}]*("nodes"|"tables"|"screens").*',
        "",
        text,
        flags=re.DOTALL,
    ).strip()

    segments = parse_segments(text) if text else []
    # Keep ``response`` populated for legacy callers and tests; build it from
    # the segments so the concatenation matches what the user actually sees.
    response_text = "\n\n".join(s["content"] for s in segments) if segments else (text if text else None)

    # Update per-persona question counter so the next turn's pace block
    # reflects what we just spent. Pace-driven handoff overrides the
    # coverage-only suggestion when the budget has been reached.
    updated_runtime_state = record_agent_reply(runtime_state, persona, response_text)

    final_suggestion = pace_handoff or compute_persona_suggestion(
        scores, persona, custom_focus_sections, used_personas=used_personas_list,
    )
    # Cooldown — same persona just suggested within the last 30s? Drop the
    # chip so the same recommendation isn't broadcast on consecutive turns.
    if final_suggestion and not should_resurface_suggestion(updated_runtime_state, final_suggestion["persona"]):
        final_suggestion = None
    updated_runtime_state = record_suggestion_fired(
        updated_runtime_state, final_suggestion["persona"] if final_suggestion else None,
    )

    return {
        "response": response_text if response_text else None,
        "segments": segments,
        "blueprint_updates": blueprint_updates,
        "session_focus": session_focus,
        "meta": meta,
        "persona_suggestion": final_suggestion,
        "output_suggestions": compute_output_suggestions(current_blueprint),
        "runtime_state": updated_runtime_state,
    }
