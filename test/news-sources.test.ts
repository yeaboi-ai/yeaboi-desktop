// The outlets as the page names them: tags, the Settings list, and health lines.

import { describe, expect, it } from 'vitest';
import {
  NAME_MAX,
  draftProblems,
  groupByDesk,
  healthLine,
  tagFor,
} from '../src/renderer/lib/news/sources';
import type { NewsSourceRow } from '../src/renderer/lib/news/types';

const NOW = new Date(2026, 8, 4, 12, 0, 0);

const row = (over: Partial<NewsSourceRow> = {}): NewsSourceRow => ({
  id: 'techmeme',
  name: 'Techmeme',
  home_url: 'https://www.techmeme.com/',
  url: 'https://www.techmeme.com/feed.xml',
  column: 'ai',
  kind: 'rss',
  builtin: true,
  enabled: true,
  ok: true,
  fetched_at: new Date(NOW.getTime() - 3 * 60_000).toISOString(),
  error: '',
  item_count: 8,
  ...over,
});

describe('tagFor', () => {
  const sources = [{ id: 'techmeme', home_url: 'https://www.techmeme.com/' }];

  it('names the outlet and links home when the paper knows where that is', () => {
    expect(tagFor({ source_id: 'techmeme', source_name: 'Techmeme' }, sources)).toEqual({
      label: 'Techmeme',
      href: 'https://www.techmeme.com/',
    });
  });

  it('has no link for an outlet the paper does not list, or an http home', () => {
    expect(tagFor({ source_id: 'nope', source_name: 'Nope' }, sources).href).toBe('');
    expect(
      tagFor({ source_id: 'x', source_name: 'X' }, [{ id: 'x', home_url: 'http://x' }]).href,
    ).toBe('');
  });

  it('calls the release notes yeaboi, without a link', () => {
    expect(tagFor({ source_id: 'yeaboi-changelog', source_name: 'yeaboi' }, sources)).toEqual({
      label: 'yeaboi',
      href: '',
    });
    expect(tagFor({ source_id: 'yeaboi-changelog', source_name: '' }, []).label).toBe('yeaboi');
  });
});

describe('groupByDesk', () => {
  it('keeps page order, built-ins before added outlets, and drops empty desks', () => {
    const desks = groupByDesk([
      row({ id: 'z-custom', column: 'ai', builtin: false, name: 'Lobsters' }),
      row({ id: 'infoq', column: 'engineering' }),
      row({ id: 'techmeme', column: 'ai' }),
      row({ id: 'yeaboi-site', column: 'yeaboi' }),
      row({ id: 'odd', column: 'research' }),
    ]);
    expect(desks.map((d) => d.title)).toEqual(['yeaboi', 'AI', 'Engineering']);
    expect(desks[1]!.rows.map((r) => r.id)).toEqual(['techmeme', 'z-custom']);
  });

  it('is empty with nothing', () => {
    expect(groupByDesk([])).toEqual([]);
  });
});

describe('healthLine', () => {
  it('says how the last read went', () => {
    expect(healthLine(row(), NOW)).toBe('8 stories, 3 minutes ago');
    expect(healthLine(row({ item_count: 1, fetched_at: '' }), NOW)).toBe('1 story');
    expect(healthLine(row({ ok: null, fetched_at: '' }), NOW)).toBe('Not read yet');
    expect(healthLine(row({ ok: false, error: 'http 404' }), NOW)).toBe(
      'Could not read it: http 404',
    );
    expect(healthLine(row({ ok: false, error: '' }), NOW)).toBe('Could not read it');
    expect(healthLine(row({ enabled: false }), NOW)).toBe('Off');
  });

  it('reads as plain words', () => {
    for (const line of [
      healthLine(row(), NOW),
      healthLine(row({ ok: false, error: 'http 404' }), NOW),
    ]) {
      expect(line).not.toMatch(/[·→—]/);
    }
  });
});

describe('draftProblems', () => {
  it('passes a good draft and names each problem', () => {
    expect(draftProblems({ url: 'https://x.example/feed', name: 'X', column: 'ai' })).toEqual([]);
    expect(draftProblems({ url: 'http://x.example/feed', name: 'X', column: 'ai' })[0]).toMatch(
      /https/,
    );
    expect(draftProblems({ url: 'https://x', name: '  ', column: 'ai' })[0]).toMatch(/name/);
    expect(
      draftProblems({ url: 'https://x', name: 'x'.repeat(NAME_MAX + 1), column: 'ai' })[0],
    ).toMatch(/name/);
    expect(draftProblems({ url: 'https://x', name: 'X', column: 'research' })[0]).toMatch(/desk/);
    expect(draftProblems({ url: 'http://x', name: '', column: '?' })).toHaveLength(3);
  });
});
