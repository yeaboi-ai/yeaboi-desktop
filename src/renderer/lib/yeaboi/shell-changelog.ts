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
  /** Optional so an older backend, whose entries predate headlines, still parses. */
  headline?: string;
  summary: string;
  highlights: Highlight[];
}

/** One area tag's accent, as served by /api/meta/changelog. */
export interface AreaAccent {
  name: string;
  color: string;
}

/** One What's New row, tagged with which ledger it came from. */
export type MergedEntry = Entry & { channel: 'app' | 'backend' };

export const SHELL_ENTRIES: Entry[] = (shellLedger as { entries: Entry[] }).entries;

/** Accents for the shell ledger's own area names. The backend serves colours for
 *  its vocabulary only, and the app's areas are not in it, so without these every
 *  app-channel tag would fall back to the neutral chip while backend ones bloom. */
export const SHELL_AREA_ACCENTS: Record<string, string> = {
  onboarding: 'rgb(100,180,100)',
  updater: 'rgb(220,160,60)',
  packaging: 'rgb(140,120,230)',
  shell: 'rgb(90,160,210)',
};

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

/** The entry's title. Falls back to the summary's first sentence for an entry
 *  written before headlines existed — the same fallback the backend loader makes,
 *  repeated here because the shell ledger is read straight off disk. */
export function entryHeadline(entry: Entry): string {
  if (entry.headline) return entry.headline;
  const first = entry.summary.trim().split(/(?<=[.!?])\s/, 1)[0] ?? '';
  return first.replace(/\.+$/, '');
}

/** The last release each ledger was read at. The app and yeaboi carry separate
 *  version lines, so one marker cannot speak for both. */
export interface SeenVersions {
  app: string;
  backend: string;
}

function isNewer(version: string, seen: string): boolean {
  const parse = (v: string) => v.split('.').map((part) => parseInt(part, 10) || 0);
  const cur = parse(version);
  const was = parse(seen);
  for (let i = 0; i < Math.max(cur.length, was.length); i += 1) {
    const a = cur[i] ?? 0;
    const b = was[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** The releases newer than what the reader last saw, newest-first, each channel
 *  measured against its own marker. A channel with no marker contributes nothing:
 *  a first visit has nothing to catch up on. */
export function entriesSince(entries: MergedEntry[], seen: SeenVersions): MergedEntry[] {
  return entries.filter((entry) => {
    const marker = entry.channel === 'app' ? seen.app : seen.backend;
    return Boolean(marker) && isNewer(entry.version, marker);
  });
}

/** The newest version in each ledger — what to record once the reader has looked. */
export function headVersions(entries: MergedEntry[]): SeenVersions {
  return {
    app: entries.find((e) => e.channel === 'app')?.version ?? '',
    backend: entries.find((e) => e.channel === 'backend')?.version ?? '',
  };
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

/** `2026-08-31` → `31 Aug 2026`. An unparseable value passes straight through.
 *  The locale is pinned, as everywhere else that formats a date in this app. */
export function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The month heading a release is grouped under. */
export function monthOf(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** Every area an entry touches, first-seen order — its colour signature.
 *  `general` sits on almost every release, so beside a real area it says nothing. */
export function areasOf(entry: Entry): string[] {
  const areas = [...new Set(entry.highlights.flatMap((h) => h.areas))];
  const named = areas.filter((a) => a !== 'general');
  return named.length > 0 ? named : areas;
}

/** Fold the head of each ledger into the stored markers, never backwards.
 *  Rolling back to an older app would otherwise replay releases already read. */
export function mergeSeen(stored: SeenVersions, head: SeenVersions): SeenVersions {
  return {
    app: !stored.app || isNewer(head.app, stored.app) ? head.app || stored.app : stored.app,
    backend:
      !stored.backend || isNewer(head.backend, stored.backend)
        ? head.backend || stored.backend
        : stored.backend,
  };
}
