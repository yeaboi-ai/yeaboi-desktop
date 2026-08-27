/**
 * Compute the "current topic" the AI is steering toward — the lowest-coverage
 * section within the active persona's focus area. Mirrors the heuristic the
 * backend uses for steering (see facilitator.py: PERSONA_FOCUS_SECTIONS +
 * assess_coverage) but stays client-side so the pinned chat header updates
 * instantly on every blueprint change, including user edits.
 */

const PERSONA_FOCUS: Record<string, string[]> = {
  default: ["tech_stack", "architecture", "infrastructure", "api_integrations"],
  pm: ["project_overview", "goals_constraints", "users_personas", "ui_ux", "out_of_scope"],
  architect: ["architecture", "tech_stack", "api_integrations", "infrastructure", "security_compliance"],
  mentor: ["project_overview", "goals_constraints", "users_personas", "team_capacity", "open_questions"],
  challenger: ["risks_unknowns", "goals_constraints", "out_of_scope", "security_compliance"],
};

/** Threshold below which a section is considered "needs more attention".
 * Matches the backend's content-length-driven score buckets at ~score 80
 * (~300 chars). */
const SUFFICIENT_LENGTH = 300;

export function computeCurrentTopic(
  blueprintContent: Record<string, string | undefined> | undefined,
  persona: string | undefined,
): string | null {
  if (!blueprintContent) return null;
  const focus = PERSONA_FOCUS[persona || "default"] || PERSONA_FOCUS.default;

  let lowest: { section: string; length: number } | null = null;
  for (const section of focus) {
    const length = (blueprintContent[section] || "").trim().length;
    if (length >= SUFFICIENT_LENGTH) continue;
    if (!lowest || length < lowest.length) {
      lowest = { section, length };
    }
  }
  return lowest?.section ?? null;
}

/**
 * Pick the section the most recent AI turn actually wrote to. The pinned
 * "Currently" strip uses this as the primary signal — it matches what the
 * user sees in the "Updated X" badge — so the indicator reflects what the
 * agent is doing, not where the lowest-coverage heuristic says it should go.
 */
export function lastAiUpdatedSection(
  messages: Array<{ id: string; message_type: string }>,
  sectionUpdatesByMessageId: Record<string, string[]> | undefined,
): string | null {
  if (!sectionUpdatesByMessageId) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.message_type !== "ai") continue;
    const updated = sectionUpdatesByMessageId[m.id];
    if (updated && updated.length > 0) return updated[0];
  }
  return null;
}
