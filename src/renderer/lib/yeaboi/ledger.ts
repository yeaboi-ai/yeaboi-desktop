// The Projects ledger's pure half: the row grid every line of the sheet
// shares, the head row's sentences, the serif words, and the split into rows
// and Completed. Pure, so test/ledger.test.ts pins it in the node lane.

import { splitProjects, statusActionLabel } from '@/lib/yeaboi/projects';

/** The label the date column shows on a suggested row. */
export const START_FROM_LABEL = 'Start from this';

/** One column per flow step between the name and the date; no steps, no columns. */
export function ledgerColumns(stepCount: number): string {
  if (stepCount <= 0) return 'minmax(0, 1fr) 5.5rem';
  return `minmax(0, 1fr) repeat(${stepCount}, 3.5rem) 5.5rem`;
}

/** The grid every line of the ledger shares, so the columns cannot drift.
 *
 *  Measured against its own column rather than the window: the sheet is one of
 *  three now, and a row that asks the viewport whether it has room lays six
 *  step columns and a date across 480px and leaves the name nothing. */
export const LEDGER_ROW =
  'grid grid-cols-1 gap-x-4 gap-y-1 py-3 @3xl/ledger:items-baseline @3xl/ledger:gap-y-0 @3xl/ledger:[grid-template-columns:var(--ledger-cols)]';

/** What the head row says for the step under the pointer. */
export function leavesSentence(step: { label: string; leaves: string }): string {
  return `${step.label} leaves ${step.leaves}.`;
}

/** The serif words that head the sheet's blocks. */
export const IN_PROGRESS_WORD = 'In progress';
export const COMPLETED_WORD = 'Completed';
export const OTHER_WAYS_WORD = 'Other ways in';

/** The count beside the In progress word. */
export function projectCount(count: number): string {
  if (count === 1) return 'One project';
  return `${count} projects`;
}

/** What a row's actions say; the status one follows the row. */
export const RENAME_LABEL = 'Rename';
export const DELETE_LABEL = 'Delete';

export interface RowAction {
  key: 'rename' | 'status' | 'delete';
  label: string;
}

export function rowActions(status: string | null | undefined): RowAction[] {
  return [
    { key: 'rename', label: RENAME_LABEL },
    { key: 'status', label: statusActionLabel(status) },
    { key: 'delete', label: DELETE_LABEL },
  ];
}

/** The delete confirmation, and the answer to a refused delete. */
export const DELETE_PROJECT_TITLE = 'Delete project';
export const DELETE_PROJECT_MESSAGE =
  'Delete this project and every run inside it? This cannot be undone.';
export const NOT_ALLOWED_TITLE = 'Not allowed';
export const NOT_ALLOWED_LINE = 'Only the owner or a team admin can delete this project.';
export const UNREACHABLE_LINE = 'Could not reach the server. Check your connection and try again.';

/** Shown in place of the rows when every project is done. */
export const ALL_DONE_LINE = 'Everything here is done. Reopen one, or describe the next above.';

/** The sheet's two blocks: the rows under the composer, then Completed. */
export function ledgerSections<
  T extends { created_at: string; updated_at?: string; status?: string },
>(projects: readonly T[]): { rows: T[]; completed: T[] } {
  const { active, done } = splitProjects([...projects]);
  return { rows: active, completed: done };
}

/** A rejected fetch is a TypeError worded for a browser; anything else already
 *  carries the backend's `detail`. */
export function createErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Network error. Please check your connection.';
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't create the project. Please try again.";
}
