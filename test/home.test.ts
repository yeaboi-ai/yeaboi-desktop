// The home's two halves: the project rows with their run traces, the one-off
// session rows, the start links, and copy that reads as the brief asks —
// sentence case, no joins, no arrows, no shouting.

import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import type { Capabilities } from '../src/renderer/lib/yeaboi/capabilities';
import {
  GLIMPSE_COUNT,
  SESSIONS_UNSUPPORTED,
  TRACE_MAX,
  agentGlimpse,
  homeCopy,
  projectRows,
  projectTrace,
  sessionGlimpse,
  sessionLabel,
  sessionRows,
  startLinks,
  traceSentence,
} from '../src/renderer/lib/yeaboi/home';
import {
  runsByProject,
  shapeSessions,
  type RecentSession,
} from '../src/renderer/lib/yeaboi/sessions';

const NOW = new Date(2026, 8, 3, 15, 0, 0);

const project = (id: string, created_at: string, engine?: string) => ({
  id,
  name: `Project ${id}`,
  created_at,
  yeaboi_project_id: engine ?? null,
});

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

const runs = (n: number, over: Partial<RecentSession> = {}): RecentSession[] =>
  Array.from({ length: n }, (_, i) =>
    session({ run_id: i + 1, last_modified: `2026-09-0${Math.min(9, n - i)}T09:00:00`, ...over }),
  );

describe('projectTrace', () => {
  it('is empty for a project that has not run', () => {
    const trace = projectTrace([]);
    expect(trace).toEqual({ count: 0, lastRun: '', lastAt: '', dots: [] });
    expect(traceSentence(trace)).toBe('nothing has run here yet');
  });

  it('draws one full dot for one run and names it', () => {
    const trace = projectTrace([session({ mode: 'reporting' })]);
    expect(trace.dots).toEqual([1]);
    expect(trace.lastAt).toBe('2026-09-02T09:00:00');
    expect(traceSentence(trace)).toBe('1 run, a report');
  });

  it('brightens from the oldest to the newest', () => {
    const trace = projectTrace(runs(7));
    expect(trace.count).toBe(7);
    expect(trace.dots).toHaveLength(7);
    for (let i = 1; i < trace.dots.length; i++)
      expect(trace.dots[i]!).toBeGreaterThan(trace.dots[i - 1]!);
    expect(trace.dots[0]).toBeCloseTo(0.3);
    expect(trace.dots[6]).toBe(1);
    expect(traceSentence(trace)).toBe('7 runs, the last a standup');
  });

  it('caps the dots and keeps the true count in the sentence', () => {
    const trace = projectTrace(runs(20));
    expect(trace.dots).toHaveLength(TRACE_MAX);
    expect(traceSentence(trace)).toBe('20 runs, the last a standup');
  });

  it('takes the newest run for the sentence, with the right article', () => {
    const trace = projectTrace([session({ mode: 'analysis' }), session({ mode: 'standup' })]);
    expect(traceSentence(trace)).toBe('2 runs, the last an analysis');
    expect(traceSentence(projectTrace([session({ mode: 'review' })]))).toBe(
      '1 run, a weekly review',
    );
  });
});

describe('projectRows', () => {
  const byProject = runsByProject([
    session({ session_id: 'p', project_id: 'proj-aaaaaaaa', last_modified: '2026-09-03T08:00:00' }),
    session({ session_id: 'p', project_id: 'proj-aaaaaaaa', last_modified: '2026-08-30T08:00:00' }),
    session({ session_id: 'q', project_id: 'proj-bbbbbbbb', last_modified: '2026-08-20T08:00:00' }),
    session({ session_id: 'x', project_id: '', last_modified: '2026-09-03T12:00:00' }),
  ]);

  it('joins the runs by the engine id and sorts by the last run', () => {
    const rows = projectRows(
      [
        project('a', '2026-08-01T00:00:00', 'proj-aaaaaaaa'),
        project('b', '2026-08-15T00:00:00', 'proj-bbbbbbbb'),
        project('c', '2026-09-01T00:00:00'),
      ],
      byProject,
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(['a', 'c', 'b']);
    expect(rows[0]).toMatchObject({ name: 'Project a', when: 'today', href: '/projects/a' });
    expect(rows[0]!.trace.count).toBe(2);
    expect(rows[1]!.trace.count).toBe(0);
    expect(rows[1]!.when).toBe('2 days ago');
  });

  it('takes three at most', () => {
    const rows = projectRows(
      ['a', 'b', 'c', 'd'].map((id, i) => project(id, `2026-09-0${i + 1}T00:00:00`)),
      new Map(),
      NOW,
    );
    expect(rows).toHaveLength(GLIMPSE_COUNT);
    expect(rows.map((r) => r.key)).toEqual(['d', 'c', 'b']);
  });

  it('points Agents rows at the agents project page', () => {
    const [row] = projectRows([project('a', '2026-09-03T00:00:00')], new Map(), NOW, 'agents');
    expect(row!.href).toBe('/agents/projects/a');
  });

  it('is empty for no projects', () => {
    expect(projectRows([], new Map(), NOW)).toEqual([]);
  });
});

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

describe('sessionGlimpse', () => {
  it('rows carry the mode, the detail and the day', () => {
    const shaped = shapeSessions(
      [
        session({ session_id: 'a', mode: 'standup' }),
        session({ session_id: 'b', mode: 'reporting', title: 'Sprint 4' }),
      ],
      CARDS,
      NOW,
    );
    const rows = sessionGlimpse(shaped);
    expect(rows.map((r) => [r.primary, r.detail]).sort()).toEqual([
      ['Daily Standup', undefined],
      ['Reporting', 'Sprint 4'],
    ]);
    expect(rows.every((r) => r.secondary === 'yesterday')).toBe(true);
  });

  it('caps at three, where sessionRows keeps them all', () => {
    const shaped = shapeSessions(
      [1, 2, 3, 4, 5].map((n) => session({ session_id: `s${n}`, run_id: n })),
      CARDS,
      NOW,
    );
    expect(sessionGlimpse(shaped)).toHaveLength(GLIMPSE_COUNT);
    expect(sessionRows(shaped)).toHaveLength(5);
    expect(sessionGlimpse(shaped)).toEqual(sessionRows(shaped).slice(0, GLIMPSE_COUNT));
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

describe('startLinks', () => {
  const card = (key: string, available = true) => ({
    key,
    title: key,
    description: '',
    available,
    color: '#000',
  });
  const caps: Capabilities = {
    categories: [],
    modes: [
      card('project-planning'),
      card('daily-standup'),
      card('retro'),
      card('reporting'),
      card('performance', false),
      card('usage'),
    ],
    solo: [card('project-planning'), card('daily-standup'), card('reporting')],
    agents: [card('agent-usage')],
  };

  it('offers the world’s one-off modes at their start routes', () => {
    expect(startLinks(caps, 'team')).toEqual([
      { key: 'daily-standup', label: 'daily-standup', href: '/team/standup' },
      { key: 'retro', label: 'retro', href: '/team/retro' },
      { key: 'reporting', label: 'reporting', href: '/team/reporting/new' },
    ]);
    expect(startLinks(caps, 'solo').map((l) => l.key)).toEqual(['daily-standup', 'reporting']);
  });

  it('offers nothing in the Agents world or before the sidecar answers', () => {
    expect(startLinks(caps, 'agents')).toEqual([]);
    expect(startLinks(null, 'team')).toEqual([]);
  });
});

describe('homeCopy', () => {
  const sentences = (audience: (typeof AUDIENCES)[number]) => {
    const copy = homeCopy(audience);
    return [
      copy.question,
      copy.startLabel,
      ...[copy.projects, copy.sessions].flatMap((half) => [
        half.tagline,
        half.lead,
        half.empty,
        half.foot,
        half.action?.label ?? '',
      ]),
    ].filter(Boolean);
  };

  it('names the two doors in every world', () => {
    for (const audience of AUDIENCES) {
      const copy = homeCopy(audience);
      expect(copy.projects.word).toBe('Projects');
      expect(copy.sessions.word).toBe('Sessions');
      expect(copy.sessions.href).toBe('/sessions');
      expect(copy.projects.action?.href).toBe('/projects?new');
      expect(copy.sessions.action).toBeUndefined();
    }
    expect(homeCopy('team').projects.href).toBe('/projects');
    expect(homeCopy('agents').projects.href).toBe('/agents/projects');
  });

  it('asks the terminal’s question and answers it in three words each', () => {
    for (const audience of AUDIENCES) {
      const copy = homeCopy(audience);
      expect(copy.question).toBe('How do we work today?');
      expect(copy.projects.tagline).toBe('Work that remembers.');
      expect(copy.sessions.tagline).toBe('Work that starts fresh.');
    }
  });

  it('carries none of the templated tells', () => {
    for (const audience of AUDIENCES) {
      for (const text of [...sentences(audience), SESSIONS_UNSUPPORTED]) {
        expect(text, text).not.toMatch(/·|→|—/);
        expect(text, text).not.toMatch(/\b[A-Z]{2,}\b/);
        // Sentence case: one capital to open, none mid-sentence except a proper name.
        expect(text[0], text).toMatch(/[A-Z]/);
      }
    }
  });

  it('offers a retro to Team alone', () => {
    expect(homeCopy('team').sessions.lead).toContain('retro');
    expect(homeCopy('solo').sessions.lead).not.toContain('retro');
    expect(homeCopy('agents').sessions.lead).not.toContain('retro');
  });

  it('speaks of repos in the Agents world', () => {
    expect(homeCopy('agents').projects.lead).toMatch(/\brepo\b/);
    expect(homeCopy('agents').projects.empty).toMatch(/\brepo\b/);
    expect(homeCopy('team').projects.lead).not.toMatch(/\brepo\b/);
  });
});
