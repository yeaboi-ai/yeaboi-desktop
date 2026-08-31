// The shell's own release ledger and the What's New merge.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHELL_AREA_ACCENTS,
  SHELL_ENTRIES,
  areasOf,
  desktopBackendEntries,
  formatDate,
  mergeSeen,
  monthOf,
  entriesSince,
  entryHeadline,
  headVersions,
  mergeChangelogs,
  type Entry,
  type MergedEntry,
} from '../src/renderer/lib/yeaboi/shell-changelog';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

describe('the ledger', () => {
  it('is not empty and its head entry is the version being shipped', () => {
    // The release workflow refuses a mismatch; failing here is just cheaper.
    expect(SHELL_ENTRIES.length).toBeGreaterThan(0);
    expect(SHELL_ENTRIES[0].version).toBe(pkg.version);
  });

  it('is newest-first with ISO dates', () => {
    const dates = SHELL_ENTRIES.map((e) => e.date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('every entry has a headline, a summary and highlights', () => {
    for (const entry of SHELL_ENTRIES) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.headline).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(entry.highlights.length).toBeGreaterThan(0);
      for (const h of entry.highlights) {
        expect(h.text).toBeTruthy();
        expect(h.areas.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads as product copy, like the backend ledger it sits beside', () => {
    // The mirror of tests/unit/test_changelog.py::TestCopyContract in yeaboi.ai.
    // Every rule there is repeated here; a partial mirror is one that goes green
    // on the entry it was meant to reject.
    for (const entry of SHELL_ENTRIES) {
      expect(entry.headline!.length).toBeLessThanOrEqual(60);
      expect(entry.headline!.endsWith('.')).toBe(false);
      expect(entry.summary.length).toBeLessThanOrEqual(240);
      expect(entry.highlights.length).toBeLessThanOrEqual(4);
      for (const h of entry.highlights) {
        expect(h.text.length).toBeLessThanOrEqual(90);
        expect(h.text.endsWith('.')).toBe(false);
      }
      const sentences = entry.summary.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  it('names outcomes, never internals', () => {
    const banned: [string, RegExp][] = [
      ['backtick', /`/],
      ['command-line flag', /(?<![\w-])--[a-z][a-z-]{2,}/],
      ['function call', /\b\w+\(\)/],
      ['file name', /\b[\w-]+\.(?:py|json|ts|tsx|md|yml|yaml|toml|sh|html|css)\b/],
      ['snake_case identifier', /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/],
      ['SHOUTING_CASE identifier', /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/],
    ];
    const products = new Set([
      'GitHub',
      'DevOps',
      'PyPI',
      'JetBrains',
      'OpenAI',
      'JavaScript',
      'TypeScript',
    ]);
    for (const entry of SHELL_ENTRIES) {
      const strings = [entry.headline ?? '', entry.summary, ...entry.highlights.map((h) => h.text)];
      for (const text of strings) {
        for (const [label, pattern] of banned) {
          expect(pattern.test(text), `${entry.version}: ${label} in ${text}`).toBe(false);
        }
        for (const token of text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) ?? []) {
          expect(products.has(token), `${entry.version}: ${token} looks internal`).toBe(true);
        }
      }
    }
  });

  it('every area it uses has an accent, since the backend serves none for them', () => {
    for (const entry of SHELL_ENTRIES) {
      for (const h of entry.highlights) {
        for (const area of h.areas) expect(SHELL_AREA_ACCENTS[area], area).toBeTruthy();
      }
    }
  });
});

describe('formatDate and monthOf', () => {
  it('render a date the way the rest of the app does', () => {
    expect(formatDate('2026-08-31')).toBe('31 Aug 2026');
    expect(monthOf('2026-08-31')).toBe('August 2026');
  });

  it('pass an unparseable value straight through', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(monthOf('')).toBe('');
  });
});

describe('areasOf', () => {
  const entry = (areas: string[][]): Entry => ({
    version: '1.0.0',
    date: '2026-01-01',
    summary: '',
    highlights: areas.map((a, i) => ({ text: `h${i}`, areas: a })),
  });

  it('dedupes in first-seen order', () => {
    expect(areasOf(entry([['planning'], ['retro'], ['planning']]))).toEqual(['planning', 'retro']);
  });

  it('drops general beside a real area — it is on almost every release', () => {
    expect(areasOf(entry([['planning'], ['general']]))).toEqual(['planning']);
  });

  it('keeps general when it is all there is', () => {
    expect(areasOf(entry([['general']]))).toEqual(['general']);
  });

  it('is empty for an entry with no areas at all', () => {
    expect(areasOf(entry([[]]))).toEqual([]);
  });
});

describe('mergeSeen', () => {
  it('moves a marker forward', () => {
    expect(
      mergeSeen({ app: '4.0.0', backend: '3.32.0' }, { app: '4.1.0', backend: '3.33.0' }),
    ).toEqual({
      app: '4.1.0',
      backend: '3.33.0',
    });
  });

  it('never moves one backwards', () => {
    // Rolling back to an older app would otherwise replay releases already read.
    expect(
      mergeSeen({ app: '4.1.0', backend: '3.33.0' }, { app: '4.0.0', backend: '3.32.0' }),
    ).toEqual({
      app: '4.1.0',
      backend: '3.33.0',
    });
  });

  it('adopts a head for a channel never seen before', () => {
    expect(mergeSeen({ app: '', backend: '' }, { app: '4.0.0', backend: '3.33.0' })).toEqual({
      app: '4.0.0',
      backend: '3.33.0',
    });
  });

  it('keeps a stored marker when the head is missing', () => {
    expect(mergeSeen({ app: '4.1.0', backend: '3.33.0' }, { app: '', backend: '' })).toEqual({
      app: '4.1.0',
      backend: '3.33.0',
    });
  });
});

describe('entryHeadline', () => {
  it('uses the headline when there is one', () => {
    expect(
      entryHeadline({
        version: '1.0.0',
        date: 'd',
        headline: 'Real',
        summary: 'x.',
        highlights: [],
      }),
    ).toBe('Real');
  });

  it('falls back to the summary first sentence for an older backend', () => {
    expect(
      entryHeadline({
        version: '1.0.0',
        date: 'd',
        summary: 'Plans build themselves. And more.',
        highlights: [],
      }),
    ).toBe('Plans build themselves');
  });

  it('is empty when there is nothing to fall back to', () => {
    expect(entryHeadline({ version: '1.0.0', date: 'd', summary: '', highlights: [] })).toBe('');
  });
});

describe('entriesSince', () => {
  const merged: MergedEntry[] = [
    { version: '4.1.0', date: '2026-09-01', summary: '', highlights: [], channel: 'app' },
    { version: '3.33.0', date: '2026-08-31', summary: '', highlights: [], channel: 'backend' },
    { version: '4.0.0', date: '2026-08-30', summary: '', highlights: [], channel: 'app' },
    { version: '3.32.0', date: '2026-08-27', summary: '', highlights: [], channel: 'backend' },
  ];

  it('measures each ledger against its own marker', () => {
    const since = entriesSince(merged, { app: '4.0.0', backend: '3.32.0' });
    expect(since.map((e) => `${e.channel}:${e.version}`)).toEqual(['app:4.1.0', 'backend:3.33.0']);
  });

  it('a channel the reader has never seen contributes nothing', () => {
    // Otherwise a first visit would announce the entire ledger as new.
    expect(entriesSince(merged, { app: '', backend: '' })).toEqual([]);
    expect(entriesSince(merged, { app: '4.0.0', backend: '' }).map((e) => e.version)).toEqual([
      '4.1.0',
    ]);
  });

  it('is empty when both markers are at the head', () => {
    expect(entriesSince(merged, { app: '4.1.0', backend: '3.33.0' })).toEqual([]);
  });

  it('compares numerically, not as strings', () => {
    const entries: MergedEntry[] = [
      { version: '3.9.0', date: '2026-08-01', summary: '', highlights: [], channel: 'backend' },
    ];
    expect(entriesSince(entries, { app: '', backend: '3.10.0' })).toEqual([]);
  });
});

describe('headVersions', () => {
  it('takes the newest of each ledger', () => {
    const merged: MergedEntry[] = [
      { version: '4.0.0', date: '2026-08-30', summary: '', highlights: [], channel: 'app' },
      { version: '3.33.0', date: '2026-08-29', summary: '', highlights: [], channel: 'backend' },
      { version: '3.32.0', date: '2026-08-27', summary: '', highlights: [], channel: 'backend' },
    ];
    expect(headVersions(merged)).toEqual({ app: '4.0.0', backend: '3.33.0' });
  });

  it('leaves a missing channel empty rather than guessing', () => {
    expect(headVersions([])).toEqual({ app: '', backend: '' });
  });
});

describe('desktopBackendEntries', () => {
  const entries: Entry[] = [
    {
      version: '3.33.0',
      date: '2026-08-30',
      summary: 'mixed',
      highlights: [
        { text: 'engine change', areas: ['general'] }, // no surfaces: older backend / everywhere
        { text: 'terminal layout', areas: ['general'], surfaces: ['tui'] },
        { text: 'desktop route', areas: ['general'], surfaces: ['desktop'] },
      ],
    },
    {
      version: '3.32.0',
      date: '2026-08-27',
      summary: 'terminal only',
      highlights: [{ text: 'welcome screen rows', areas: ['general'], surfaces: ['tui'] }],
    },
  ];

  it('keeps untagged and desktop-tagged highlights, drops the rest', () => {
    const kept = desktopBackendEntries(entries);
    expect(kept.map((e) => e.version)).toEqual(['3.33.0']);
    expect(kept[0].highlights.map((h) => h.text)).toEqual(['engine change', 'desktop route']);
  });

  it('drops an entry whose every highlight is another surface', () => {
    expect(desktopBackendEntries([entries[1]])).toEqual([]);
  });

  it('passes an untagged payload through whole', () => {
    const untagged: Entry[] = [
      {
        version: '1.0.0',
        date: '2026-01-01',
        summary: 's',
        highlights: [{ text: 'x', areas: [] }],
      },
    ];
    expect(desktopBackendEntries(untagged)).toEqual(untagged);
  });
});

describe('mergeChangelogs', () => {
  const backend: Entry[] = [
    { version: '3.33.0', date: '2026-08-30', summary: 'b1', highlights: [] },
    { version: '3.31.0', date: '2026-08-20', summary: 'b2', highlights: [] },
  ];
  const shell: Entry[] = [{ version: '4.0.0', date: '2026-08-29', summary: 's1', highlights: [] }];

  it('tags each entry with its channel', () => {
    const merged = mergeChangelogs(backend, shell);
    expect(merged.map((e) => e.channel)).toEqual(['backend', 'app', 'backend']);
  });

  it('orders newest-first across both ledgers, shell first on a tied date', () => {
    const merged = mergeChangelogs(backend, [
      { version: '4.0.0', date: '2026-08-30', summary: 's1', highlights: [] },
    ]);
    expect(merged.map((e) => `${e.channel}:${e.version}`)).toEqual([
      'app:4.0.0',
      'backend:3.33.0',
      'backend:3.31.0',
    ]);
  });

  it('handles either side empty', () => {
    expect(mergeChangelogs([], shell).map((e) => e.channel)).toEqual(['app']);
    expect(mergeChangelogs(backend, []).map((e) => e.channel)).toEqual(['backend', 'backend']);
  });
});
