// The masthead's words and the paper's clock.

import { describe, expect, it } from 'vitest';
import {
  MASTHEAD_WORD,
  dateline,
  editionLine,
  editionOf,
  refreshLabel,
  volumeLine,
} from '../src/renderer/lib/news/masthead';
import { byline, relativeTime, shortDate } from '../src/renderer/lib/news/time';
import type { Paper } from '../src/renderer/lib/news/types';
import { fixturePaper } from './news-paper.test';

const NOW = new Date(2026, 8, 4, 12, 0, 0); // Friday 4 Sep 2026, local time

const prose = (text: string) => {
  expect(text).toMatch(/^[A-Z]/);
  expect(text).toMatch(/\.$/);
  expect(text).not.toMatch(/[·→—]/);
  expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
};

describe('the masthead', () => {
  it('is the name', () => {
    expect(MASTHEAD_WORD).toBe('yeaboi');
  });

  it('dates the paper in words', () => {
    expect(dateline(NOW)).toBe('Friday, 4 September 2026');
    expect(dateline(new Date(2027, 0, 1))).toBe('Friday, 1 January 2027');
  });

  it('numbers the edition from the shell version', () => {
    expect(volumeLine('4.1.0')).toBe('Vol. 4, No. 1');
    expect(volumeLine('12.0.3-beta.1')).toBe('Vol. 12, No. 0');
    expect(volumeLine('')).toBe('');
    expect(volumeLine('dev')).toBe('');
    expect(volumeLine('4.1.0')).not.toMatch(/[·→—]/);
  });
});

describe('editionOf', () => {
  it('tells fresh from stale from offline', () => {
    const paper = fixturePaper();
    expect(editionOf(null, false)).toEqual({ kind: 'offline' });
    expect(editionOf(paper, true)).toEqual({ kind: 'offline' });
    expect(editionOf({ ...paper, enabled: false }, false)).toEqual({ kind: 'off' });
    expect(editionOf(paper, false, true)).toEqual({ kind: 'notes' });
    expect(editionOf(paper, true, true)).toEqual({ kind: 'offline' });
    expect(editionOf({ ...paper, stale: true }, false)).toEqual({ kind: 'stale' });
    expect(editionOf(paper, false)).toEqual({ kind: 'fresh', generatedAt: paper.generated_at });
  });

  it('lines read as sentences', () => {
    const at = new Date(NOW.getTime() - 8 * 60_000).toISOString();
    const lines = [
      editionLine({ kind: 'fresh', generatedAt: at }, NOW),
      editionLine({ kind: 'fresh', generatedAt: '' }, NOW),
      editionLine({ kind: 'stale' }, NOW),
      editionLine({ kind: 'offline' }, NOW),
      editionLine({ kind: 'notes' }, NOW),
      editionLine({ kind: 'off' }, NOW),
    ];
    expect(lines[0]).toBe('Refreshed 8 minutes ago.');
    expect(lines[1]).toBe('Refreshed.');
    expect(lines[2]).toBe('Refreshing.');
    expect(lines[3]).toBe('Offline, showing the last paper.');
    expect(lines[4]).toMatch(/release notes/);
    expect(lines[5]).toMatch(/off/);
    expect(new Set(lines).size).toBe(lines.length);
    lines.forEach(prose);
  });
});

describe('refreshLabel', () => {
  it('offers a refresh only on a fresh paper', () => {
    expect(refreshLabel({ kind: 'fresh', generatedAt: 't' })).toBe('Refresh now.');
    expect(refreshLabel({ kind: 'stale' })).toBe('');
    expect(refreshLabel({ kind: 'offline' })).toBe('');
    expect(refreshLabel({ kind: 'notes' })).toBe('');
    expect(refreshLabel({ kind: 'off' })).toBe('');
    prose(refreshLabel({ kind: 'fresh', generatedAt: 't' }));
  });
});

describe('relativeTime', () => {
  const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

  it('speaks in minutes and hours today', () => {
    expect(relativeTime(at(10_000), NOW)).toBe('just now');
    expect(relativeTime(at(59_000), NOW)).toBe('just now');
    expect(relativeTime(at(60_000), NOW)).toBe('1 minute ago');
    expect(relativeTime(at(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(relativeTime(at(60 * 60_000), NOW)).toBe('1 hour ago');
    expect(relativeTime(at(3 * 60 * 60_000), NOW)).toBe('3 hours ago');
  });

  it('names the day this week and dates beyond it', () => {
    expect(relativeTime(new Date(2026, 8, 3, 23, 0).toISOString(), NOW)).toBe('yesterday');
    expect(relativeTime(new Date(2026, 8, 1, 9, 0).toISOString(), NOW)).toBe('Tuesday');
    expect(relativeTime(new Date(2026, 7, 29, 9, 0).toISOString(), NOW)).toBe('Saturday');
    expect(relativeTime(new Date(2026, 7, 12, 9, 0).toISOString(), NOW)).toBe('12 Aug');
    expect(relativeTime(new Date(2025, 11, 25, 9, 0).toISOString(), NOW)).toBe('25 Dec 2025');
  });

  it('passes the unreadable through and the empty as empty', () => {
    expect(relativeTime('', NOW)).toBe('');
    expect(relativeTime('soon', NOW)).toBe('soon');
    expect(shortDate(new Date(2026, 0, 2), NOW)).toBe('2 Jan');
  });

  it('never goes negative for a stamp a little ahead of the clock', () => {
    expect(relativeTime(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe('just now');
  });
});

describe('a paper with a stale flag but no items', () => {
  it('is still a stale edition, not an offline one', () => {
    const paper: Paper = { ...fixturePaper(), stale: true, lead: null, sections: [] };
    expect(editionOf(paper, false)).toEqual({ kind: 'stale' });
  });
});

describe('byline', () => {
  it('names the outlet and the time, or the outlet alone', () => {
    const at = new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString();
    expect(byline({ source_name: 'Techmeme', published: at }, NOW)).toBe('Techmeme, 2 hours ago');
    expect(byline({ source_name: 'Techmeme', published: '' }, NOW)).toBe('Techmeme');
  });
});
