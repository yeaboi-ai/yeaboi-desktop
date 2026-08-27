// Infer a ticket type slug from card labels. Used as a fallback when a card
// has no template_id — e.g. cards generated before Phase 3 wired the template
// composer into task_generator. Returned slug matches the system templates so
// TemplateBadge can render a real coloured pill instead of the neutral fallback.

import type { Card } from "@/hooks/use-board";

const PATTERNS: Array<[string[], string]> = [
  // Order matters: more specific markers first.
  [["bug", "defect", "regression", "incident"], "bug"],
  [["spike", "research", "investigation", "rfc", "discovery"], "spike"],
  [["tech-debt", "tech_debt", "techdebt", "refactor", "cleanup", "debt"], "tech_debt"],
  [["chore", "ci", "tooling", "lint", "format"], "chore"],
];

const SYSTEM_NAMES: Record<string, string> = {
  feature: "Feature",
  bug: "Bug",
  chore: "Chore",
  spike: "Spike",
  tech_debt: "Tech debt",
};

export function inferTypeFromLabels(labels: string[] | null | undefined): string | null {
  if (!labels?.length) return null;
  const lowered = labels.map((l) => l.toLowerCase());
  for (const [needles, slug] of PATTERNS) {
    if (needles.some((n) => lowered.includes(n))) return slug;
  }
  return null;
}

export interface ResolvedTicketType {
  slug: string;
  name: string;
  /** True when the type was inferred from labels because the card has no template_id. */
  inferred: boolean;
}

/** Resolve a card's display type from its template_id (preferred) or labels (fallback).
 *  Defaults to "feature" for AI-generated cards with no template and no specific label
 *  markers — almost every backlog item from a planning session is a feature unless it
 *  explicitly says otherwise.
 */
export function resolveTicketType(
  card: Card,
  templates: Array<{ id: string; slug: string; name: string }>,
): ResolvedTicketType | null {
  if (card.template_id) {
    const t = templates.find((x) => x.id === card.template_id);
    if (t) return { slug: t.slug, name: t.name, inferred: false };
  }
  const inferred = inferTypeFromLabels(card.labels);
  if (inferred) {
    return { slug: inferred, name: SYSTEM_NAMES[inferred] ?? inferred, inferred: true };
  }
  // Sensible default for AI-generated tickets with no signals.
  return { slug: "feature", name: SYSTEM_NAMES.feature, inferred: true };
}
