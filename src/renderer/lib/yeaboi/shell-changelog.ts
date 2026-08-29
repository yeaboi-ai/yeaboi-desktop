// The shell's own release ledger, plus the merge that builds the What's New
// feed: the app's entries (shell-changelog.json, bundled here) interleaved
// with the backend entries that matter on the desktop. The backend ledger
// arrives over /api/meta/changelog; its highlights carry `surfaces` tags
// (tui/desktop/web) and only the desktop-relevant ones belong on this page.
//
// shell-changelog.json is also what the release workflow turns into GitHub
// release notes (scripts/release-notes.mjs), and the workflow refuses to cut
// a release whose version is not this ledger's head entry — a release always
// ships its notes.

import shellLedger from './shell-changelog.json';

export interface Highlight {
  text: string;
  areas: string[];
  /** Absent on shell entries and on payloads from older backends: means all. */
  surfaces?: string[];
}

export interface Entry {
  version: string;
  date: string;
  summary: string;
  highlights: Highlight[];
}

/** One What's New row, tagged with which ledger it came from. */
export type MergedEntry = Entry & { channel: 'app' | 'backend' };

export const SHELL_ENTRIES: Entry[] = (shellLedger as { entries: Entry[] }).entries;

/** The backend entries that matter on the desktop: keep highlights whose
 *  `surfaces` is absent (an older backend, or an everywhere-change) or names
 *  'desktop'; drop entries that end up with none. */
export function desktopBackendEntries(entries: Entry[]): Entry[] {
  const kept: Entry[] = [];
  for (const entry of entries) {
    const highlights = entry.highlights.filter(
      (h) => !h.surfaces || h.surfaces.includes('desktop'),
    );
    if (highlights.length > 0) kept.push({ ...entry, highlights });
  }
  return kept;
}

/** Interleave the two ledgers newest-first by date; the app's entry wins a
 *  tie so a release day reads shell-then-backend. Both inputs arrive already
 *  newest-first, so a merge keeps each ledger's own order. */
export function mergeChangelogs(backend: Entry[], shell: Entry[]): MergedEntry[] {
  const merged: MergedEntry[] = [];
  let b = 0;
  let s = 0;
  while (b < backend.length || s < shell.length) {
    const backendNext = backend[b];
    const shellNext = shell[s];
    if (shellNext && (!backendNext || shellNext.date >= backendNext.date)) {
      merged.push({ ...shellNext, channel: 'app' });
      s += 1;
    } else if (backendNext) {
      merged.push({ ...backendNext, channel: 'backend' });
      b += 1;
    }
  }
  return merged;
}
