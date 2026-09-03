// The home's two halves: three rows each, and copy that reads as the brief
// asks — sentence case, no joins, no arrows, no shouting.

import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import {
  GLIMPSE_COUNT,
  SESSIONS_UNSUPPORTED,
  agentGlimpse,
  homeCopy,
  projectGlimpse,
  sessionGlimpse,
  sessionRows,
} from '../src/renderer/lib/yeaboi/home';
import { shapeSessions, type RecentSession } from '../src/renderer/lib/yeaboi/sessions';

const NOW = new Date(2026, 8, 3, 15, 0, 0);

const project = (id: string, created_at: string) => ({ id, name: `Project ${id}`, created_at });

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
];

describe('projectGlimpse', () => {
  it('takes the newest three, newest first', () => {
    const rows = projectGlimpse(
      [
        project('a', '2026-08-01T00:00:00'),
        project('b', '2026-09-03T00:00:00'),
        project('c', '2026-08-20T00:00:00'),
        project('d', '2026-09-01T00:00:00'),
      ],
      NOW,
    );
    expect(rows).toHaveLength(GLIMPSE_COUNT);
    expect(rows.map((r) => r.key)).toEqual(['b', 'd', 'c']);
    expect(rows[0]).toMatchObject({
      primary: 'Project b',
      secondary: 'today',
      href: '/projects/b',
    });
  });

  it('points Agents rows at the agents project page', () => {
    const [row] = projectGlimpse([project('a', '2026-09-03T00:00:00')], NOW, 'agents');
    expect(row!.href).toBe('/agents/projects/a');
  });

  it('is empty for no projects', () => {
    expect(projectGlimpse([], NOW)).toEqual([]);
  });
});

describe('sessionGlimpse', () => {
  it('shows the mode alone when the run has no title, else both', () => {
    const shaped = shapeSessions(
      [
        session({ session_id: 'a', mode: 'standup' }),
        session({ session_id: 'b', mode: 'reporting', title: 'Sprint 4' }),
      ],
      CARDS,
      NOW,
    );
    const rows = sessionGlimpse(shaped);
    expect(rows.map((r) => r.primary).sort()).toEqual(['Daily Standup', 'Reporting: Sprint 4']);
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

describe('homeCopy', () => {
  const sentences = (audience: (typeof AUDIENCES)[number]) => {
    const copy = homeCopy(audience);
    return [copy.projects, copy.sessions].flatMap((half) => [half.lead, half.empty, half.foot]);
  };

  it('names the two doors in every world', () => {
    for (const audience of AUDIENCES) {
      const copy = homeCopy(audience);
      expect(copy.projects.word).toBe('Projects');
      expect(copy.sessions.word).toBe('Sessions');
      expect(copy.sessions.href).toBe('/sessions');
    }
    expect(homeCopy('team').projects.href).toBe('/projects');
    expect(homeCopy('agents').projects.href).toBe('/agents/projects');
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
    expect(homeCopy('agents').projects.lead).toContain('repo');
    expect(homeCopy('team').projects.lead).not.toContain('repo');
  });
});
