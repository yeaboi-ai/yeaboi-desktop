// A short list of runs as rows: the Sessions screen's recent runs, a
// project's runs inside it, and the Agents world's report kinds. Pure (test/glimpse.test.ts); GlimpseList draws a row.

import type { Audience } from '@shared/audience';
import { relativeDay, type RecentSession, type ShapedSession } from './sessions';

export interface GlimpseRow {
  key: string;
  primary: string;
  /** A quiet word after the primary: a report's period, a plan's name. */
  detail?: string;
  secondary: string;
  href: string;
}

/** A store's own title after its `<Mode> — ` prefix; the whole title otherwise. */
const titleRemainder = (title: string): string => {
  const match = /^[^—]+ — (.+)$/.exec(title);
  return match ? match[1]!.trim() : title.trim();
};

/** A remainder that says nothing the row does not already: a bare day (the
 *  row's stamp says it), or the raw `new-<8hex>-<date>` id a planning session
 *  carries until it is named. A report's month is kept: it is the period. */
const isBareStamp = (text: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) || /^new-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}$/.test(text);

/** The mode as the row's name, and whatever the run's own title adds to it. */
export function sessionLabel(row: ShapedSession): { primary: string; detail?: string } {
  const remainder = titleRemainder(row.session.title);
  if (!remainder || remainder === row.modeTitle || isBareStamp(remainder)) {
    return { primary: row.modeTitle };
  }
  return { primary: row.modeTitle, detail: remainder };
}

/** Shaped runs as rows: the mode's name, then what the run's title adds. */
export function sessionRows(sessions: ShapedSession[]): GlimpseRow[] {
  return sessions.map((row) => ({
    key: row.key,
    ...sessionLabel(row),
    secondary: row.when,
    href: row.route,
  }));
}

/** What a Sessions list says when nothing has run. */
export const SESSIONS_EMPTY = 'Nothing has run on its own yet.';

/** What the list says when the sidecar predates the recent-sessions route. */
export const SESSIONS_UNSUPPORTED =
  'This sidecar does not list sessions yet. Open Sessions to start one.';
