// A platform project's status, and the pure rules the two Projects lists and
// the project page share. Done is explicit: the owner marks it, and archive
// and delete stay separate. A row with no status predates the column and
// counts as active.

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
