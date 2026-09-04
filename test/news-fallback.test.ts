// The paper an older sidecar gets: the release notes, and nothing fetched.

import { describe, expect, it } from 'vitest';
import { APP_RELEASE_URL, fallbackPaper } from '../src/renderer/lib/news/fallback';
import {
  SHELL_ENTRIES,
  entryHeadline,
  type Entry,
} from '../src/renderer/lib/yeaboi/shell-changelog';

const NOW = new Date(2026, 8, 4, 12, 0, 0);

const backend: Entry[] = [
  {
    version: '3.9.0',
    date: '2026-09-01',
    headline: 'The engine grows a front page',
    summary: 'A paper, served.',
    highlights: [{ text: 'A front page', areas: ['general'], surfaces: ['desktop'] }],
  },
  {
    version: '3.8.0',
    date: '2026-08-20',
    headline: 'Terminal only',
    summary: 'Nothing for the desktop.',
    highlights: [{ text: 'A terminal thing', areas: ['general'], surfaces: ['tui'] }],
  },
];

describe('fallbackPaper', () => {
  it('lists the shell entries alone when the backend has none', () => {
    const paper = fallbackPaper(SHELL_ENTRIES, null, NOW);
    expect(paper.enabled).toBe(false);
    expect(paper.stale).toBe(false);
    expect(paper.lead).toBeNull();
    expect(paper.sources).toEqual([]);
    expect(paper.sections.map((s) => s.column)).toEqual(['yeaboi']);
    const items = paper.sections[0]!.items;
    expect(items).toHaveLength(SHELL_ENTRIES.length);
    expect(items[0]!.title).toBe(
      `yeaboi for Mac ${SHELL_ENTRIES[0]!.version}: ${entryHeadline(SHELL_ENTRIES[0]!)}`,
    );
    expect(items[0]!.url).toBe(APP_RELEASE_URL);
  });

  it('merges the backend entries that reach the desktop, newest first', () => {
    const items = fallbackPaper(SHELL_ENTRIES, backend, NOW).sections[0]!.items;
    const versions = items.map((item) => item.id);
    expect(versions).toContain('release:backend:3.9.0');
    expect(versions).not.toContain('release:backend:3.8.0');
    const engine = items.find((item) => item.id === 'release:backend:3.9.0')!;
    expect(engine.url).toBe('https://pypi.org/project/yeaboi/3.9.0/');
    expect(engine.source_name).toBe('yeaboi');
    expect(engine.published).toBe('2026-09-01T00:00:00');
    const dates = items.map((item) => item.published);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('marks every row a release read by the wizard', () => {
    for (const item of fallbackPaper(SHELL_ENTRIES, backend, NOW).sections[0]!.items) {
      expect(item.kind).toBe('release');
      expect(item.column).toBe('yeaboi');
      expect(item.persona).toBe('wizard');
      expect(item.image_url).toBeNull();
    }
  });

  it('has no sections at all with nothing to list', () => {
    expect(fallbackPaper([], [], NOW).sections).toEqual([]);
  });
});
