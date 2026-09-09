// Runs as rows: named by their mode, with what the run's own title adds.

import { describe, expect, it } from 'vitest';
import {
  SESSIONS_UNSUPPORTED,
  sessionLabel,
  sessionRows,
  SESSIONS_EMPTY,
} from '../src/renderer/lib/yeaboi/glimpse';
import { shapeSessions, type RecentSession } from '../src/renderer/lib/yeaboi/sessions';

const NOW = new Date(2026, 8, 3, 15, 0, 0);

const session = (over: Partial<RecentSession>): RecentSession => ({
  session_id: 's',
  run_id: 1,
  mode: 'standup',
  title: '',
  created_at: '2026-09-02T09:00:00',
  last_modified: '2026-09-02T09:00:00',
  project_id: '',
  ...over,
});

const CARDS = [
  { key: 'daily-standup', title: 'Daily Standup' },
  { key: 'reporting', title: 'Reporting' },
  { key: 'project-planning', title: 'Planning' },
];

describe('sessionLabel', () => {
  const label = (over: Partial<RecentSession>) =>
    sessionLabel(shapeSessions([session(over)], CARDS, NOW)[0]!);

  it('names the row by its mode alone when the title adds nothing', () => {
    expect(label({ mode: 'standup', title: '' })).toEqual({ primary: 'Daily Standup' });
    expect(label({ mode: 'standup', title: 'Standup — 2026-09-02' })).toEqual({
      primary: 'Daily Standup',
    });
    expect(label({ mode: 'planning', title: 'new-b8bb60b8-2026-09-03' })).toEqual({
      primary: 'Planning',
    });
  });

  it('keeps what the title adds as the detail', () => {
    expect(label({ mode: 'reporting', title: 'Report — 2026-08' })).toEqual({
      primary: 'Reporting',
      detail: '2026-08',
    });
    expect(label({ mode: 'reporting', title: 'Sprint 4' })).toEqual({
      primary: 'Reporting',
      detail: 'Sprint 4',
    });
    expect(label({ mode: 'planning', title: 'lendflow-2026-09-03' })).toEqual({
      primary: 'Planning',
      detail: 'lendflow-2026-09-03',
    });
  });
});

describe('sessionRows', () => {
  it('rows carry the mode, the detail and the day, every one of them', () => {
    const shaped = shapeSessions(
      [
        session({ session_id: 'a', mode: 'standup' }),
        session({ session_id: 'b', mode: 'reporting', title: 'Sprint 4' }),
        session({ session_id: 'c', mode: 'planning' }),
        session({ session_id: 'd', mode: 'standup', run_id: 2 }),
      ],
      CARDS,
      NOW,
    );
    const rows = sessionRows(shaped);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => [r.primary, r.detail]).sort()).toEqual([
      ['Daily Standup', undefined],
      ['Daily Standup', undefined],
      ['Planning', undefined],
      ['Reporting', 'Sprint 4'],
    ]);
    expect(rows.every((r) => r.secondary === 'yesterday')).toBe(true);
  });
});

describe('the empty sentences', () => {
  it('invite an action and carry no templated tells', () => {
    for (const text of [SESSIONS_EMPTY, SESSIONS_UNSUPPORTED]) {
      expect(text).toMatch(/\.$/);
      expect(text).not.toMatch(/[·→—]/);
    }
  });
});
