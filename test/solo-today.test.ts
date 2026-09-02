// The solo home's Today tiles — the pure formatter behind the strip.

import { describe, expect, it } from 'vitest';
import { todayTiles, type SoloToday } from '../src/renderer/lib/yeaboi/solo';

const full: SoloToday = {
  project_id: 'proj-1',
  project_name: 'Ducks',
  standup_date: '2026-08-31',
  standup_summary: 'Closed PSOT-14; shipped PSOT-9',
  standup_blockers: '',
  sprint_name: 'Sprint 2',
  sprint_day: 4,
  sprint_total_days: 10,
  confidence_pct: 72,
  confidence_label: 'On track',
  confidence_trend: 'improving',
  next_story_id: 'STORY-12',
  next_story_title: 'Add OAuth login',
  next_sprint_name: 'Sprint 2',
  plan_session_id: 'sess-1',
  plan_scoped: true,
  spend_usd: 12.4,
  spend_sessions: 7,
  spend_known: true,
  warnings: [],
};

describe('todayTiles', () => {
  it('renders four empty tiles for a fresh install', () => {
    const tiles = todayTiles(null);
    expect(tiles.map((t) => t.key)).toEqual(['yesterday', 'sprint', 'next', 'spend']);
    expect(tiles.every((t) => t.empty)).toBe(true);
    expect(tiles.map((t) => t.value)).toEqual([
      'no standup yet — run one',
      'no sprint context yet',
      'no plan yet — plan one',
      'no agent sessions logged this week',
    ]);
  });

  it('formats a full snapshot and routes each tile to its mode', () => {
    const tiles = todayTiles(full);
    expect(tiles.every((t) => !t.empty)).toBe(true);
    expect(tiles.map((t) => t.value)).toEqual([
      'Closed PSOT-14; shipped PSOT-9',
      'Sprint day 4/10 · On track (72%) ↑',
      'STORY-12 Add OAuth login · Sprint 2',
      '$12.40 across 7 sessions',
    ]);
    expect(tiles.map((t) => t.route)).toEqual([
      '/team/standup',
      '/team/standup',
      '/team/planning',
      '/usage',
    ]);
  });

  it('falls back per field, not all or nothing', () => {
    const tiles = todayTiles({
      ...full,
      next_story_id: '',
      next_story_title: '',
      spend_sessions: 0,
    });
    expect(tiles[0].empty).toBe(false);
    expect(tiles[1].empty).toBe(false);
    // A plan exists but its sprint has nothing queued — a different sentence.
    expect(tiles[2]).toMatchObject({ empty: true, value: 'your plan has no sprint stories yet' });
    expect(tiles[3]).toMatchObject({ empty: true, value: 'no agent sessions logged this week' });
  });

  it('appends blockers to yesterday and marks an unpriced spend approximate', () => {
    const tiles = todayTiles({
      ...full,
      standup_blockers: 'waiting on review',
      spend_known: false,
      spend_sessions: 1,
      spend_usd: 0.5,
    });
    expect(tiles[0].value).toBe('Closed PSOT-14; shipped PSOT-9 — blocked: waiting on review');
    expect(tiles[3].value).toBe('~$0.50 across 1 session');
  });

  it('shows a known zero spend as money, not as the empty state', () => {
    const tiles = todayTiles({ ...full, spend_usd: 0, spend_sessions: 3, spend_known: true });
    expect(tiles[3]).toMatchObject({ empty: false, value: '$0.00 across 3 sessions' });
  });

  it('says a standup ran even when it had nothing to summarise', () => {
    const tiles = todayTiles({ ...full, standup_summary: '' });
    expect(tiles[0]).toMatchObject({
      empty: false,
      value: 'a standup ran, with nothing to summarise',
    });
  });
});
