/**
 * Render `BlueprintSnapshot.created_by` as a human label for the history UI.
 *
 * The backend already resolves UUIDs to display names and well-known literal
 * strings to friendly labels (see `services/blueprint_authors.py`); this
 * helper provides a frontend fallback for when only the raw `created_by`
 * value is available, plus the "You" personalization that the backend
 * doesn't know about (it doesn't see the requesting user identity).
 */

const ACTOR_LABELS: Record<string, string> = {
  system: 'System',
  system_revert: 'System (revert)',
  system_reset: 'System (reset)',
  ai_extraction: 'Voice Agent',
  'ai-agent': 'Voice Agent',
  ai_facilitator: 'AI Facilitator',
  'ai-vision': 'Vision',
  chat: 'Chat AI',
  // The session-create flow auto-distributes the user-typed initial idea
  // via an LLM. Different from a manual user edit (which carries a UUID).
  intake: 'Initial intake',
  // Legacy data: pre-fix some rows have created_by="user" (literal). Show
  // the same label so older history doesn't render as generic "User".
  user: 'Initial intake',
};

/** Map a raw `created_by` value to a friendly label.
 *
 * If a `serverLabel` is provided (preferred — the backend list endpoint
 * already resolves UUIDs and literals), prefer it but personalize it to
 * "You" when the underlying id matches the current user.
 */
export function labelForCreatedBy(
  createdBy: string,
  options: { currentUserId?: string | null; serverLabel?: string | null } = {},
): string {
  const { currentUserId, serverLabel } = options;
  if (currentUserId && createdBy && createdBy === currentUserId) {
    return 'You';
  }
  if (serverLabel) {
    return serverLabel;
  }
  if (createdBy in ACTOR_LABELS) {
    return ACTOR_LABELS[createdBy];
  }
  // Looks like a UUID we couldn't resolve — show a stable but neutral label
  // rather than leaking the raw id into the UI.
  return 'User';
}
