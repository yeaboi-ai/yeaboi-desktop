// The plan view — what GET /api/chat/sessions/{id}/plan returns, typed, and
// the pure rules the Blueprint drawer draws by: the seven sections in order,
// which artifact card belongs to which section, and the turn an edit sends.
// Text and numbers only, as the wire carries them; nothing here renders.

export type SectionKey =
  'intake' | 'analysis' | 'epic' | 'features' | 'stories' | 'tasks' | 'sprints';

export type SectionStatus = 'empty' | 'generating' | 'awaiting_review' | 'accepted';

export const PLAN_SECTIONS: readonly SectionKey[] = [
  'intake',
  'analysis',
  'epic',
  'features',
  'stories',
  'tasks',
  'sprints',
];

export const SECTION_TITLES: Record<SectionKey, string> = {
  intake: 'Your answers',
  analysis: 'Analysis',
  epic: 'Epic',
  features: 'Features',
  stories: 'Stories',
  tasks: 'Tasks',
  sprints: 'Sprints',
};

export interface PlanSection {
  kind: SectionKey;
  title: string;
  status: SectionStatus;
  /** The newest accepted version; 0 until the section has been accepted once. */
  version: number;
  /** How many accepted versions there are. */
  versions: number;
}

export interface IntakeQuestion {
  number: number;
  label: string;
  answer: string;
  /** The four-way tag the terminal draws: answered, from description, default, skipped. */
  source: string;
  /** The finer provenance, when the engine recorded one. */
  origin?: string;
  skipped: boolean;
}

export interface IntakePhase {
  key: string;
  label: string;
  questions: IntakeQuestion[];
}

export interface PlanIntake {
  completed: boolean;
  confirmed: boolean;
  prior_art_pending: boolean;
  phases: IntakePhase[];
  prior_art: { key: string; name: string; url: string; platform: string }[];
}

export interface PlanFeature {
  id: string;
  title: string;
  description: string;
  priority: string;
}

export interface PlanCriterion {
  given: string;
  when: string;
  then: string;
  text: string;
}

export interface PlanStory {
  id: string;
  title: string;
  description?: string;
  story_points?: number;
  acceptance_criteria?: PlanCriterion[];
  [extra: string]: unknown;
}

export interface PlanTask {
  id: string;
  title: string;
  [extra: string]: unknown;
}

export interface PlanSprint {
  id: string;
  name: string;
  goal: string;
  capacity_points: number;
  story_ids: string[];
}

export interface PlanView {
  session_id: string;
  stage: string;
  intake_mode: string;
  sections: PlanSection[];
  intake?: PlanIntake;
  analysis?: Record<string, unknown>;
  epic?: { reviewed: boolean; calibration_profile_id: string };
  features?: PlanFeature[];
  stories?: PlanStory[];
  tasks?: PlanTask[];
  sprints?: PlanSprint[];
  capacity?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}

export interface PlanVersionRef {
  section: SectionKey;
  version: number;
  created_at: string;
}

/** The artifact cards the chat pushes, and the section each one belongs to. */
const ARTIFACT_SECTIONS: Record<string, SectionKey> = {
  intake_summary: 'intake',
  prior_art: 'intake',
  analysis: 'analysis',
  epic: 'epic',
  features: 'features',
  stories: 'stories',
  tasks: 'tasks',
  sprints: 'sprints',
  sprint_plan: 'sprints',
};

/** The section an artifact card belongs to, or null for one that is not a section (the recap). */
export function artifactSection(kind: string): SectionKey | null {
  return ARTIFACT_SECTIONS[kind] ?? null;
}

/** The seven sections in order, with a missing one standing in as empty so
 *  the drawer always draws the whole plan. */
export function sectionsOf(view: Pick<PlanView, 'sections'> | null): PlanSection[] {
  const byKind = new Map((view?.sections ?? []).map((section) => [section.kind, section]));
  return PLAN_SECTIONS.map(
    (kind) =>
      byKind.get(kind) ?? {
        kind,
        title: SECTION_TITLES[kind],
        status: 'empty',
        version: 0,
        versions: 0,
      },
  );
}

/** How far the plan has come: sections accepted so far, out of seven. */
export function acceptedCount(sections: readonly PlanSection[]): number {
  return sections.filter((section) => section.status === 'accepted').length;
}

/**
 * The turn an edit becomes. An intake answer is re-asked by number — the
 * literal the intake node consumes itself; any other section is refined by
 * chatting, prefixed so the gate reads it as feedback rather than an answer.
 */
export function editTurn(section: SectionKey, instruction: string, question?: number): string {
  if (section === 'intake' && question !== undefined) return `edit ${question}`;
  return `edit ${section}: ${instruction.trim()}`;
}
