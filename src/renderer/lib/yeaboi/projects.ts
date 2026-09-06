// A platform project's status, and the pure rules the two Projects lists and
// the project page share. Done is explicit: the owner marks it, and archive
// and delete stay separate. A row with no status predates the column and
// counts as active.

import { cardKeyForMode } from './sessions';

export type ProjectStatus = 'active' | 'done';

export interface StatusRow {
  status?: string | null;
  updated_at?: string;
  created_at: string;
}

export function isDone(p: Pick<StatusRow, 'status'>): boolean {
  return p.status === 'done';
}

const stamp = (row: StatusRow): string => row.updated_at ?? row.created_at;

/** In progress and Completed, each newest first by its last change. */
export function splitProjects<T extends StatusRow>(rows: T[]): { active: T[]; done: T[] } {
  const newestFirst = [...rows].sort((a, b) => stamp(b).localeCompare(stamp(a)));
  return {
    active: newestFirst.filter((row) => !isDone(row)),
    done: newestFirst.filter(isDone),
  };
}

/** The fact a page states under the name. */
export function statusWord(status: string | null | undefined): string {
  return isDone({ status }) ? 'Completed' : 'In progress';
}

/** The status the one control moves the project to. */
export function nextStatus(status: string | null | undefined): ProjectStatus {
  return isDone({ status }) ? 'active' : 'done';
}

/** What the one control says. */
export function statusActionLabel(status: string | null | undefined): string {
  return isDone({ status }) ? 'Reopen' : 'Mark done';
}

/** The engine's runs grouped by engine project id, each as the set of card
 *  keys that have run inside it. A run with no project id is a one-off and
 *  belongs to nobody. */
export function runsByEngineProject(
  sessions: readonly { project_id?: string | null; mode: string }[],
): Map<string, Set<string>> {
  const ran = new Map<string, Set<string>>();
  for (const session of sessions) {
    if (!session.project_id) continue;
    const keys = ran.get(session.project_id) ?? new Set<string>();
    keys.add(cardKeyForMode(session.mode));
    ran.set(session.project_id, keys);
  }
  return ran;
}

export interface TraceStep {
  key: string;
  label: string;
  ran: boolean;
}

/** The flow's steps in order, each marked with whether a run of it has
 *  happened inside the project. No runs known means every step is still to come. */
export function traceFor(
  steps: readonly { key: string; label: string }[],
  ran: ReadonlySet<string> | undefined,
): TraceStep[] {
  return steps.map((step) => ({
    key: step.key,
    label: step.label,
    ran: ran?.has(step.key) ?? false,
  }));
}

/** One sentence for a screen reader: which steps have run inside, which have not. */
export function traceSentence(trace: readonly TraceStep[]): string {
  const list = (words: string[]) =>
    words.length <= 1
      ? words.join('')
      : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  const done = trace.filter((step) => step.ran).map((step) => step.label);
  const todo = trace.filter((step) => !step.ran).map((step) => step.label);
  if (done.length === 0) return 'Nothing has run inside yet.';
  if (todo.length === 0) return `${list(done)} ${done.length === 1 ? 'has' : 'have'} run inside.`;
  return `${list(done)} ${done.length === 1 ? 'has' : 'have'} run inside; ${list(todo)} ${todo.length === 1 ? 'has' : 'have'} not.`;
}
