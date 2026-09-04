// Runs as rows: named by their mode, with what the run's own title adds.

import { describe, expect, it } from 'vitest';
import {
  SESSIONS_UNSUPPORTED,
  agentGlimpse,
  insideRows,
  latestByMode,
  oneOff,
  scoped,
  sessionLabel,
  sessionRows,
  sessionsEmpty,
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

describe('latestByMode', () => {
  it('keeps the newest run per card key, as a day', () => {
    const stamps = latestByMode(
      [
        session({ session_id: 'a', mode: 'standup', last_modified: '2026-09-01T09:00:00' }),
        session({ session_id: 'b', mode: 'standup', last_modified: '2026-09-02T09:00:00' }),
        session({
          session_id: 'c',
          mode: 'reporting',
          last_modified: '',
          created_at: '2026-08-12',
        }),
      ],
      NOW,
    );
    expect(stamps).toEqual({ 'daily-standup': 'yesterday', reporting: '12 Aug' });
  });

  it('is empty for no runs', () => {
    expect(latestByMode([], NOW)).toEqual({});
  });
});

describe('oneOff', () => {
  it('keeps only the runs that belong to no project', () => {
    const rows = [
      session({ session_id: 'a', project_id: '' }),
      session({ session_id: 'b', project_id: 'proj-1' }),
    ];
    expect(oneOff(rows).map((r) => r.session_id)).toEqual(['a']);
  });
});

describe('scoped', () => {
  it('is the complement of oneOff', () => {
    const rows = [
      session({ session_id: 'a', project_id: '' }),
      session({ session_id: 'b', project_id: 'proj-1' }),
      session({ session_id: 'c', project_id: 'proj-2' }),
    ];
    expect(scoped(rows).map((r) => r.session_id)).toEqual(['b', 'c']);
    expect([...scoped(rows), ...oneOff(rows)]).toHaveLength(rows.length);
  });
});

describe('insideRows', () => {
  const projects = [
    { id: 'p-web', name: 'yeaboi.ai', yeaboi_project_id: 'proj-1' },
    { id: 'p-none', name: 'unlinked', yeaboi_project_id: null },
  ];

  it('names a run by its project, the mode as the detail, opened inside that project', () => {
    const rows = insideRows(
      [session({ session_id: 'a', mode: 'standup', project_id: 'proj-1' })],
      CARDS,
      projects,
      NOW,
    );
    expect(rows).toEqual([
      {
        key: 'standup:a:1',
        primary: 'yeaboi.ai',
        detail: 'Daily Standup',
        secondary: 'yesterday',
        href: '/team/standup?project=p-web',
      },
    ]);
  });

  it('names a run whose project is no longer listed by its mode alone', () => {
    const rows = insideRows(
      [session({ session_id: 'a', mode: 'reporting', project_id: 'proj-gone' })],
      CARDS,
      projects,
      NOW,
    );
    expect(rows[0]).toMatchObject({ primary: 'Reporting', href: '/team/reporting' });
    expect(rows[0]!.detail).toBeUndefined();
  });

  it('lists newest first', () => {
    const rows = insideRows(
      [
        session({ session_id: 'old', project_id: 'proj-1', last_modified: '2026-08-01T09:00:00' }),
        session({ session_id: 'new', project_id: 'proj-1', last_modified: '2026-09-03T09:00:00' }),
      ],
      CARDS,
      projects,
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(['standup:new:1', 'standup:old:1']);
  });
});

describe('agentGlimpse', () => {
  const cards = [
    { key: 'agent-usage', title: 'Usage' },
    { key: 'agent-security', title: 'Security' },
    { key: 'agent-nope', title: 'Nope' },
  ];
  const routes = { 'agent-usage': '/agents/usage', 'agent-security': '/agents/security' };

  it('stamps a kind with its report day and says when there is none', () => {
    const rows = agentGlimpse(cards, { 'agent-usage': '2026-09-02T10:00:00' }, routes, NOW);
    expect(rows).toEqual([
      { key: 'agent-usage', primary: 'Usage', secondary: 'yesterday', href: '/agents/usage' },
      {
        key: 'agent-security',
        primary: 'Security',
        secondary: 'no report yet',
        href: '/agents/security',
      },
    ]);
  });
});

describe('the empty sentences', () => {
  it('invite an action and carry no templated tells', () => {
    for (const text of [sessionsEmpty('team'), sessionsEmpty('agents'), SESSIONS_UNSUPPORTED]) {
      expect(text).toMatch(/\.$/);
      expect(text).not.toMatch(/[·→—]/);
    }
    expect(sessionsEmpty('solo')).toBe(sessionsEmpty('team'));
    expect(sessionsEmpty('agents')).not.toBe(sessionsEmpty('team'));
  });
});
