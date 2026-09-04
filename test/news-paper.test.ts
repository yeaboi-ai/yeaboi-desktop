// The paper as an edition: the lead first, the desks in turn, each story once.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLUMN_TITLES,
  EDITION_SIZE,
  KICKERS,
  isEmpty,
  isExternal,
  kicker,
  readMoreLabel,
  sourcesLine,
  storiesOf,
} from '../src/renderer/lib/news/paper';
import {
  NEWS_COLUMNS,
  type NewsItem,
  type NewsSourceStatus,
  type Paper,
} from '../src/renderer/lib/news/types';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/news-paper.json');

export function fixturePaper(): Paper {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Paper;
}

const source = (over: Partial<NewsSourceStatus> = {}): NewsSourceStatus => ({
  id: 'a',
  name: 'A',
  home_url: 'https://a.example/',
  column: 'ai',
  ok: true,
  fetched_at: '',
  error: '',
  item_count: 1,
  ...over,
});

const label = (over: Partial<NewsItem>) =>
  readMoreLabel({ kind: 'article', source_id: 'techmeme', source_name: 'Techmeme', ...over });

describe('storiesOf', () => {
  it('opens on the lead, then takes the desks in turn', () => {
    const ids = storiesOf(fixturePaper()).map((s) => s.id);
    expect(ids[0]).toBe('lead1');
    expect(ids.slice(0, 7)).toEqual(['lead1', 'rel410', 'ai1', 'e1', 'ai2', 'e2', 'ai3']);
  });

  it('never repeats a story and never draws a desk the paper has no page for', () => {
    const stories = storiesOf(fixturePaper());
    expect(new Set(stories.map((s) => s.id)).size).toBe(stories.length);
    expect(stories.every((s) => (NEWS_COLUMNS as readonly string[]).includes(s.column))).toBe(true);
    expect(stories.some((s) => s.column === 'research')).toBe(false);
  });

  it('is capped at the edition size', () => {
    expect(storiesOf(fixturePaper())).toHaveLength(EDITION_SIZE);
    expect(storiesOf(fixturePaper(), { size: 3 }).map((s) => s.id)).toEqual([
      'lead1',
      'rel410',
      'ai1',
    ]);
  });

  it('gives a lead with no sections an edition of one', () => {
    const paper: Paper = { ...fixturePaper(), sections: [] };
    expect(storiesOf(paper).map((s) => s.id)).toEqual(['lead1']);
  });

  it('is empty with nothing to print', () => {
    expect(storiesOf({ ...fixturePaper(), lead: null, sections: [] })).toEqual([]);
  });
});

describe('kicker and readMoreLabel', () => {
  it('names the desk', () => {
    expect(kicker({ column: 'ai' })).toBe('From the AI desk');
    expect(kicker({ column: 'yeaboi' })).toBe('From yeaboi');
    expect(kicker({ column: 'engineering' })).toBe('From the engineering desk');
    expect(kicker({ column: 'research' })).toBe('');
    for (const text of Object.values(KICKERS)) {
      expect(text).not.toMatch(/\.$/);
      expect(text).not.toMatch(/[·→—]/);
      expect((text.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => w !== 'AI')).toEqual([]);
    }
  });

  it('says where the story opens', () => {
    expect(label({})).toBe('Read more at Techmeme');
    expect(label({ kind: 'video', source_id: 'yeaboi-youtube' })).toBe('Watch on YouTube');
    expect(label({ kind: 'release', source_id: 'yeaboi-changelog' })).toBe(
      'Read the release notes',
    );
    expect(label({ kind: 'post', source_id: 'yeaboi-site', source_name: 'yeaboi.ai' })).toBe(
      'Read more on yeaboi.ai',
    );
    for (const text of [label({}), label({ kind: 'video' }), label({ kind: 'release' })]) {
      expect(text).toMatch(/^[A-Z]/);
      expect(text).not.toMatch(/\.$/);
      expect(text).not.toMatch(/[·→—]/);
    }
  });
});

describe('sourcesLine', () => {
  it('says nothing with no sources', () => {
    expect(sourcesLine([])).toBe('');
  });

  it('counts outlets and the ones down', () => {
    expect(sourcesLine([source(), source({ id: 'b' })])).toBe('Read from 2 outlets.');
    expect(sourcesLine([source()])).toBe('Read from 1 outlet.');
    expect(
      sourcesLine([source(), source({ id: 'b', ok: false }), source({ id: 'c', ok: false })]),
    ).toBe('Read from 1 outlet, two not answering.');
    const many = Array.from({ length: 12 }, (_, i) => source({ id: String(i), ok: false }));
    expect(sourcesLine([source(), ...many])).toBe('Read from 1 outlet, 12 not answering.');
  });

  it('reads as a sentence', () => {
    for (const text of [
      sourcesLine([source()]),
      sourcesLine([source(), source({ id: 'b', ok: false })]),
    ]) {
      expect(text).toMatch(/^[A-Z]/);
      expect(text).toMatch(/\.$/);
      expect(text).not.toMatch(/[·→—]/);
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('COLUMN_TITLES', () => {
  it('names every desk, one or two words, no period, and only AI in capitals', () => {
    expect(NEWS_COLUMNS).toEqual(['yeaboi', 'ai', 'engineering']);
    for (const column of NEWS_COLUMNS) {
      const title = COLUMN_TITLES[column];
      expect(title.split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(title).not.toMatch(/\.$/);
      expect(title).not.toMatch(/[·→—]/);
      const caps = title.match(/\b[A-Z]{2,}\b/g) ?? [];
      expect(caps.filter((word) => word !== 'AI')).toEqual([]);
    }
  });
});

describe('isExternal and isEmpty', () => {
  it('tells an outlet link from an in-app one', () => {
    expect(isExternal('https://outlet.example/x')).toBe(true);
    expect(isExternal('http://outlet.example/x')).toBe(true);
    expect(isExternal('/whats-new')).toBe(false);
  });

  it('knows an empty paper', () => {
    expect(isEmpty(fixturePaper())).toBe(false);
    const bare: Paper = { ...fixturePaper(), lead: null, sections: [] };
    expect(isEmpty(bare)).toBe(true);
    const onlyResearch: Paper = {
      ...bare,
      sections: fixturePaper().sections.filter((s) => s.column === 'research'),
    };
    expect(isEmpty(onlyResearch)).toBe(true);
    expect(isEmpty({ ...bare, lead: fixturePaper().lead })).toBe(false);
  });
});
