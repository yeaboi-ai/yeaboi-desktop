// The home's mode menu: the terminal's cards minus the ones the rail already
// draws, arrow keys that stop at the ends, and a Recent filter that only
// offers a mode with something to show.

import { describe, expect, it } from 'vitest';
import {
  ALL_MODES,
  MENU_HIDDEN,
  filterRecent,
  menuCards,
  menuMove,
  recentFilters,
} from '../src/renderer/lib/home/menu';
import type { Capabilities } from '../src/renderer/lib/yeaboi/capabilities';
import { shapeSessions, type RecentSession } from '../src/renderer/lib/yeaboi/sessions';

const card = (key: string, title: string, badge?: string) => ({
  key,
  title,
  description: `runs the ${title.toLowerCase()}`,
  available: true,
  color: 'green',
  ...(badge ? { badge } : {}),
});

const CAPS: Capabilities = {
  categories: [],
  modes: [
    card('team-analysis', 'Analysis'),
    card('project-planning', 'Planning'),
    card('daily-standup', 'Standup'),
    card('retro', 'Retro'),
    card('performance', 'Performance', 'BETA'),
    card('settings', 'Settings'),
  ],
  solo: [
    card('team-analysis', 'Analysis'),
    card('weekly-review', 'Review'),
    card('settings', 'Settings'),
  ],
  agents: [card('agent-usage', 'Agent Usage')],
};

const NOW = new Date('2026-09-11T12:00:00');

const row = (mode: string, title = ''): RecentSession => ({
  session_id: `s-${mode}`,
  run_id: 1,
  mode,
  title,
  created_at: '2026-09-10T09:00:00',
  last_modified: '2026-09-10T09:00:00',
  project_id: '',
});

describe('menuCards', () => {
  it("keeps the terminal's order and drops what the rail draws itself", () => {
    expect(menuCards(CAPS, 'team').map((c) => c.key)).toEqual([
      'team-analysis',
      'project-planning',
      'daily-standup',
      'retro',
      'performance',
    ]);
    expect(MENU_HIDDEN.has('settings')).toBe(true);
  });

  it('offers the Solo world its own cards plus the agents family', () => {
    expect(menuCards(CAPS, 'solo').map((c) => c.key)).toEqual([
      'team-analysis',
      'weekly-review',
      'agent-usage',
    ]);
  });

  it('carries the badge through untouched', () => {
    expect(menuCards(CAPS, 'team').find((c) => c.key === 'performance')?.badge).toBe('BETA');
  });
});

describe('menuMove', () => {
  it('steps by one sideways and by a row up and down', () => {
    expect(menuMove(0, 'ArrowRight', 8, 4)).toBe(1);
    expect(menuMove(1, 'ArrowLeft', 8, 4)).toBe(0);
    expect(menuMove(1, 'ArrowDown', 8, 4)).toBe(5);
    expect(menuMove(5, 'ArrowUp', 8, 4)).toBe(1);
  });

  it('stops at both ends rather than wrapping', () => {
    expect(menuMove(0, 'ArrowLeft', 8, 4)).toBe(0);
    expect(menuMove(7, 'ArrowRight', 8, 4)).toBe(7);
    expect(menuMove(6, 'ArrowDown', 8, 4)).toBe(7);
    expect(menuMove(2, 'ArrowUp', 8, 4)).toBe(0);
  });

  it('jumps to either end and survives an empty menu', () => {
    expect(menuMove(3, 'Home', 8, 4)).toBe(0);
    expect(menuMove(3, 'End', 8, 4)).toBe(7);
    expect(menuMove(3, 'ArrowRight', 0, 4)).toBe(0);
    expect(menuMove(0, 'ArrowDown', 3, 0)).toBe(1);
  });
});

describe('recentFilters', () => {
  const cards = CAPS.modes;

  it('offers every mode, then only the modes that have run, in card order', () => {
    const rows = shapeSessions([row('retro'), row('standup'), row('analysis')], cards, NOW);
    expect(recentFilters(cards, rows).map((f) => f.key)).toEqual([
      ALL_MODES,
      'team-analysis',
      'daily-standup',
      'retro',
    ]);
  });

  it('offers just the whole list when nothing has run', () => {
    expect(recentFilters(cards, []).map((f) => f.key)).toEqual([ALL_MODES]);
  });
});

describe('filterRecent', () => {
  const cards = CAPS.modes;
  const rows = shapeSessions([row('retro'), row('standup'), row('retro', 'Sprint 12')], cards, NOW);

  it('keeps the rows of one mode, by its card key', () => {
    expect(filterRecent(rows, 'retro').map((r) => r.session.mode)).toEqual(['retro', 'retro']);
    expect(filterRecent(rows, 'daily-standup')).toHaveLength(1);
  });

  it('keeps everything for the whole list and for a key nothing carries', () => {
    expect(filterRecent(rows, ALL_MODES)).toHaveLength(3);
    expect(filterRecent(rows, 'poker')).toHaveLength(3);
  });
});
