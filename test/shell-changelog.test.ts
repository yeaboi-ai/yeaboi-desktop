// The shell's own release ledger and the What's New merge.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHELL_ENTRIES,
  desktopBackendEntries,
  mergeChangelogs,
  type Entry,
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

  it('every entry has a summary and highlights', () => {
    for (const entry of SHELL_ENTRIES) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.summary).toBeTruthy();
      expect(entry.highlights.length).toBeGreaterThan(0);
      for (const h of entry.highlights) {
        expect(h.text).toBeTruthy();
        expect(h.areas.length).toBeGreaterThan(0);
      }
    }
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
