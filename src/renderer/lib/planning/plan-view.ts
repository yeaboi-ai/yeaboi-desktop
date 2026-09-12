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
  epic?: {
    reviewed: boolean;
    calibration_profile_id: string;
    name?: string;
    description?: string;
    goals?: string[];
  };
  features?: PlanFeature[];
  stories?: PlanStory[];
  tasks?: PlanTask[];
  sprints?: PlanSprint[];
  capacity?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  counts?: { features: number; stories: number; tasks: number; sprints: number };
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

/** One line of a section as the drawer and the cards draw it. */
export interface PlanItem {
  id: string;
  text: string;
  /** A quieter second line: a description, the points, the goal. */
  note?: string;
  /** Where an intake answer came from: answered, from description, default, skipped. */
  source?: string;
}

const ANALYSIS_LISTS: [string, string][] = [
  ['goals', 'Goal'],
  ['end_users', 'For'],
  ['tech_stack', 'Built with'],
  ['integrations', 'Integrates'],
  ['constraints', 'Constraint'],
  ['risks', 'Risk'],
  ['out_of_scope', 'Out of scope'],
  ['assumptions', 'Assumes'],
];

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v) : [];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function analysisItems(analysis: Record<string, unknown>): PlanItem[] {
  const items: PlanItem[] = [];
  const description = text(analysis['description']);
  if (description) items.push({ id: 'a:description', text: description });
  const kind = text(analysis['type']);
  if (kind) items.push({ id: 'a:type', text: `A ${kind} project` });
  const target = text(analysis['target_state']);
  if (target) items.push({ id: 'a:target', text: target, note: 'Where it ends up' });
  for (const [key, noun] of ANALYSIS_LISTS) {
    strings(analysis[key]).forEach((entry, index) =>
      items.push({ id: `a:${key}:${index}`, text: entry, note: noun }),
    );
  }
  return items;
}

/** The lines of one section, in the order the engine holds them. */
export function sectionItems(view: PlanView | null, kind: SectionKey): PlanItem[] {
  if (!view) return [];
  switch (kind) {
    case 'intake':
      return (view.intake?.phases ?? []).flatMap((phase) =>
        phase.questions.map((question) => ({
          id: `q:${question.number}`,
          text: `${question.label}: ${question.answer || (question.skipped ? 'skipped' : 'not answered')}`,
          note: phase.label,
          source: question.source,
        })),
      );
    case 'analysis':
      return view.analysis ? analysisItems(view.analysis) : [];
    case 'epic': {
      const epic = view.epic;
      if (!epic || (!epic.name && !epic.description)) return [];
      return [
        { id: 'epic', text: epic.name || 'The epic', note: epic.description || undefined },
        ...(epic.goals ?? []).map((goal, index) => ({
          id: `epic:goal:${index}`,
          text: goal,
          note: 'Goal',
        })),
      ];
    }
    case 'features':
      return (view.features ?? []).map((feature) => ({
        id: feature.id,
        text: feature.title,
        note: [feature.priority, feature.description].filter(Boolean).join(', ') || undefined,
      }));
    case 'stories':
      return (view.stories ?? []).map((story) => ({
        id: story.id,
        text: story.title,
        note: story.story_points ? `${story.story_points} points` : undefined,
      }));
    case 'tasks':
      return (view.tasks ?? []).map((task) => ({ id: task.id, text: task.title }));
    case 'sprints':
      return (view.sprints ?? []).map((sprint) => ({
        id: sprint.id,
        text: sprint.name,
        note:
          [sprint.goal, `${sprint.story_ids.length} stories`].filter(Boolean).join(', ') ||
          undefined,
      }));
  }
}

/** A section as plain lines, for the editor's seed and a version diff. */
export function sectionText(view: PlanView | null, kind: SectionKey): string {
  return sectionItems(view, kind)
    .map((item) => (item.note ? `${item.text} (${item.note})` : item.text))
    .join('\n');
}

/** How a section's status reads, in a word. */
export const STATUS_WORDS: Record<SectionStatus, string> = {
  empty: '',
  generating: 'drafting',
  awaiting_review: 'awaiting your review',
  accepted: 'accepted',
};
