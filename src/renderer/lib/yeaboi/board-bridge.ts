// The unified-board bridge: a yeaboi plan (epics/stories/tasks/sprints from
// the TUI's planning engine) landing on the planning-platform kanban board as
// cards.
//
// Mapping: story → card; sprint order → wave (sprint N's stories run as wave
// N, the board's execution-order grouping); epic → an `epic:<name>` label
// plus a `yeaboi` source label; the story's tasks → a markdown checklist in
// the card description. Every card carries `yeaboi_session_id` /
// `yeaboi_story_id` in custom_fields — the identity that makes re-import
// idempotent: matched cards are updated in place, new ones are created,
// nothing is ever deleted.
//
// Creation goes through the board's own `/stories/commit` (the completion
// wizard's endpoint, so cards get waves/labels/friendly-ids by the board's
// one code path); updates go through `PATCH /api/cards/{id}`.

import type { Plan, PlanStory } from './plan';

/** One row of `/stories/commit`'s task list — the wizard's own shape. */
export interface CommitTask {
  title: string;
  description: string;
  priority: string;
  story_points: number | null;
  labels: string[];
  acceptance_criteria: string[];
  depends_on_indices: number[];
  wave: number | null;
  custom_fields: Record<string, string>;
}

export interface MappedStory {
  storyId: string;
  task: CommitTask;
}

export interface ImportPreview {
  create: MappedStory[];
  update: { card: BoardCard; task: CommitTask; storyId: string }[];
}

export interface ImportSummary {
  created: number;
  updated: number;
}

export interface BoardCard {
  id: string;
  title: string;
  description?: string | null;
  story_points?: number | null;
  custom_fields?: Record<string, unknown> | null;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** The sprint index each story runs in, by the plan's own sprint order. */
function waveOf(plan: Plan, storyId: string): number | null {
  const sprints = plan.sprints ?? [];
  for (let index = 0; index < sprints.length; index += 1) {
    if ((sprints[index]?.story_ids ?? []).includes(storyId)) return index;
  }
  return null;
}

function epicLabelOf(plan: Plan, story: PlanStory): string {
  const feature = (plan.features ?? []).find((row) => row.id === story.feature_id);
  const title = feature?.title?.trim();
  return title ? `epic:${title}` : '';
}

function checklistOf(plan: Plan, storyId: string): string {
  const rows = (plan.tasks ?? []).filter((task) => task.story_id === storyId);
  if (!rows.length) return '';
  return ['', '### Tasks', ...rows.map((task) => `- [ ] ${task.title ?? task.id}`)].join('\n');
}

/** Map the plan's stories into commit rows, in sprint order then leftovers. */
export function mapPlan(plan: Plan): MappedStory[] {
  const sessionId = plan.session_id ?? '';
  const ordered: PlanStory[] = [];
  const seen = new Set<string>();
  for (const sprint of plan.sprints ?? []) {
    for (const id of sprint.story_ids ?? []) {
      const story = (plan.stories ?? []).find((row) => row.id === id);
      if (story && story.id && !seen.has(story.id)) {
        ordered.push(story);
        seen.add(story.id);
      }
    }
  }
  for (const story of plan.stories ?? []) {
    if (story.id && !seen.has(story.id)) {
      ordered.push(story);
      seen.add(story.id);
    }
  }
  return ordered.map((story) => {
    const storyId = story.id ?? '';
    const epicLabel = epicLabelOf(plan, story);
    return {
      storyId,
      task: {
        title: story.title ?? storyId,
        description: `${story.description ?? ''}${checklistOf(plan, storyId)}`.trim(),
        priority: 'medium',
        story_points: story.story_points ?? null,
        labels: ['yeaboi', ...(epicLabel ? [epicLabel] : [])],
        acceptance_criteria: [],
        depends_on_indices: [],
        wave: waveOf(plan, storyId),
        custom_fields: { yeaboi_session_id: sessionId, yeaboi_story_id: storyId },
      },
    };
  });
}

function refOf(card: BoardCard): string {
  const fields = card.custom_fields ?? {};
  const value = fields['yeaboi_story_id'];
  return typeof value === 'string' ? value : '';
}

/** Split mapped stories into creates and in-place updates against the board. */
export async function previewImport(
  authFetch: AuthFetch,
  projectId: string,
  mapped: MappedStory[],
): Promise<ImportPreview> {
  const response = await authFetch(`/api/projects/${projectId}/board`);
  if (!response.ok) throw new Error(`could not read the board (${response.status})`);
  const board = (await response.json()) as { columns?: { cards?: BoardCard[] }[] };
  const byRef = new Map<string, BoardCard>();
  for (const column of board.columns ?? []) {
    for (const card of column.cards ?? []) {
      const ref = refOf(card);
      if (ref) byRef.set(ref, card);
    }
  }
  const preview: ImportPreview = { create: [], update: [] };
  for (const row of mapped) {
    const existing = byRef.get(row.storyId);
    if (existing) preview.update.push({ card: existing, task: row.task, storyId: row.storyId });
    else preview.create.push(row);
  }
  return preview;
}

/** Send a task list to the board's own commit endpoint — the one code path
 *  that gives cards their waves, labels and friendly ids. Shared with the
 *  session's completion wizard, which commits the list it previewed.
 *  Returns the count the board reports, falling back to what was sent. */
export async function commitTasks<T>(
  authFetch: AuthFetch,
  projectId: string,
  tasks: readonly T[],
): Promise<number> {
  const response = await authFetch(`/api/projects/${projectId}/stories/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `commit failed (${response.status})`);
  }
  const body = (await response.json().catch(() => ({}))) as { task_count?: number };
  return body.task_count ?? tasks.length;
}

/** Run the import: create the new cards, update the matched ones. */
export async function runImport(
  authFetch: AuthFetch,
  projectId: string,
  preview: ImportPreview,
): Promise<ImportSummary> {
  let created = 0;
  if (preview.create.length) {
    created = await commitTasks(
      authFetch,
      projectId,
      preview.create.map((row) => row.task),
    );
  }
  let updated = 0;
  for (const row of preview.update) {
    const response = await authFetch(`/api/cards/${row.card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: row.task.title,
        description: row.task.description,
        story_points: row.task.story_points,
      }),
    });
    if (response.ok) updated += 1;
  }
  return { created, updated };
}
