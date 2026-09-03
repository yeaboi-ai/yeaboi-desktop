// The recent-sessions list's pure half: mode aliases, day words, shaping.

import { describe, expect, it } from 'vitest';
import {
  MODE_KEY_ALIASES,
  cardKeyForMode,
  relativeDay,
  shapeSessions,
  type RecentSession,
} from '../src/renderer/lib/yeaboi/sessions';
import { MODE_ROUTES } from '../src/renderer/lib/yeaboi/tips';

const NOW = new Date(2026, 8, 3, 15, 0, 0); // 3 Sep 2026, local time

const row = (over: Partial<RecentSession> = {}): RecentSession => ({
  session_id: 's1',
  run_id: 1,
  mode: 'standup',
  title: '',
  created_at: '2026-09-02T09:00:00',
  last_modified: '2026-09-02T09:30:00',
  project_id: '',
  ...over,
});

const CARDS = [
  { key: 'daily-standup', title: 'Daily Standup' },
  { key: 'reporting', title: 'Reporting' },
  { key: 'team-analysis', title: 'Analysis' },
  { key: 'weekly-review', title: 'Weekly Review' },
];

describe('cardKeyForMode', () => {
  it('maps the engine names whose card key differs', () => {
    expect(cardKeyForMode('standup')).toBe('daily-standup');
    expect(cardKeyForMode('analysis')).toBe('team-analysis');
    expect(cardKeyForMode('planning')).toBe('project-planning');
    expect(cardKeyForMode('review')).toBe('weekly-review');
  });

  it('passes the rest through unchanged', () => {
    for (const mode of ['reporting', 'retro', 'ship', 'weekly-review', 'poker']) {
      expect(cardKeyForMode(mode)).toBe(mode);
    }
  });

  it('every alias lands on a routed card', () => {
    for (const key of Object.values(MODE_KEY_ALIASES)) expect(MODE_ROUTES[key], key).toBeTruthy();
  });
});

describe('relativeDay', () => {
  it('speaks in calendar days, not 24-hour windows', () => {
    expect(relativeDay('2026-09-03T00:10:00', NOW)).toBe('today');
    expect(relativeDay('2026-09-02T23:50:00', NOW)).toBe('yesterday');
    expect(relativeDay('2026-08-31T09:00:00', NOW)).toBe('3 days ago');
    expect(relativeDay('2026-08-28T09:00:00', NOW)).toBe('6 days ago');
  });

  it('switches to a date at a week', () => {
    expect(relativeDay('2026-08-27T09:00:00', NOW)).toBe('27 Aug');
    expect(relativeDay('2026-08-12T09:00:00', NOW)).toBe('12 Aug');
  });

  it('adds the year once it differs', () => {
    expect(relativeDay('2025-12-24T09:00:00', NOW)).toBe('24 Dec 2025');
  });

  it('treats the future as today and an unparseable stamp as itself', () => {
    expect(relativeDay('2026-09-04T09:00:00', NOW)).toBe('today');
    expect(relativeDay('not a date', NOW)).toBe('not a date');
  });
});

describe('shapeSessions', () => {
  it('titles a run from its card and falls back to the mode title', () => {
    const [shaped] = shapeSessions([row()], CARDS, NOW);
    expect(shaped).toMatchObject({
      title: 'Daily Standup',
      modeTitle: 'Daily Standup',
      when: 'yesterday',
      route: '/team/standup',
    });
  });

  it('keeps the row title when there is one', () => {
    const [shaped] = shapeSessions(
      [row({ mode: 'reporting', title: 'Sprint 4 report' })],
      CARDS,
      NOW,
    );
    expect(shaped!.title).toBe('Sprint 4 report');
    expect(shaped!.modeTitle).toBe('Reporting');
    expect(shaped!.route).toBe('/team/reporting');
  });

  it('orders newest first by last_modified, then created_at', () => {
    const shaped = shapeSessions(
      [
        row({ session_id: 'a', last_modified: '2026-09-01T10:00:00' }),
        row({ session_id: 'b', last_modified: '', created_at: '2026-09-03T10:00:00' }),
        row({ session_id: 'c', last_modified: '2026-09-02T10:00:00' }),
      ],
      CARDS,
      NOW,
    );
    expect(shaped.map((s) => s.session.session_id)).toEqual(['b', 'c', 'a']);
  });

  it('names an unknown mode by its engine name rather than dropping it', () => {
    const [shaped] = shapeSessions([row({ mode: 'poker' })], CARDS, NOW);
    expect(shaped!.modeTitle).toBe('poker');
    expect(shaped!.route).toBe('/team/poker');
  });

  it('opens a weekly review on its own report', () => {
    const [shaped] = shapeSessions([row({ mode: 'weekly-review', run_id: 7 })], CARDS, NOW);
    expect(shaped!.route).toBe('/solo/review/report?id=7');
  });

  it('gives every row a distinct key', () => {
    const shaped = shapeSessions(
      [row({ run_id: 1 }), row({ run_id: 2 }), row({ mode: 'reporting', run_id: 1 })],
      CARDS,
      NOW,
    );
    expect(new Set(shaped.map((s) => s.key)).size).toBe(3);
  });
});
