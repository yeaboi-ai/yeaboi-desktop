// The audience split's pure decisions: what the persisted value means, which
// worlds a route belongs to, and where a deep link should switch to.

import { describe, expect, it } from 'vitest';
import { audiencesForRoute, normalizeAudience, resolveAudience } from '../src/shared/audience';

describe('normalizeAudience', () => {
  it('passes the three worlds through', () => {
    expect(normalizeAudience('solo')).toBe('solo');
    expect(normalizeAudience('team')).toBe('team');
    expect(normalizeAudience('agents')).toBe('agents');
  });

  it('migrates the pre-split name to team', () => {
    expect(normalizeAudience('humans')).toBe('team');
  });

  it('clamps anything else to "never asked"', () => {
    for (const garbage of [
      'Humans',
      'TEAM',
      'Solo ',
      'robots',
      '',
      1,
      true,
      {},
      [],
      null,
      undefined,
    ]) {
      expect(normalizeAudience(garbage)).toBeUndefined();
    }
  });
});

describe('audiencesForRoute', () => {
  it('claims every agentwatch route for agents alone', () => {
    for (const path of [
      '/agents/usage',
      '/agents/advisor',
      '/agents/standup',
      '/agents/security',
    ]) {
      expect(audiencesForRoute(path)).toEqual(['agents']);
    }
  });

  it('keeps the modes that need a room team-only', () => {
    for (const path of [
      '/team/retro',
      '/team/retro/board',
      '/team/poker',
      '/team/poker/new',
      '/team/performance',
      '/team/performance/engineer',
    ]) {
      expect(audiencesForRoute(path)).toEqual(['team']);
    }
  });

  it('shares the workspace routes between team and solo, team first', () => {
    for (const path of [
      '/team/analysis/results',
      '/team/standup',
      '/team/reporting/style',
      '/team/ship/run',
      '/projects',
      '/projects/p1/blueprint',
      '/board',
      '/tickets/t1',
      '/ceremonies',
      '/ceremonies/slack',
      '/provenance',
      '/usage',
      '/recordings/r1',
      '/recording/tok',
      '/clip/tok',
    ]) {
      // Team-first order is load-bearing: it is the canonical owner a deep
      // link switches to when the current world owns no part of the route.
      expect(audiencesForRoute(path)).toEqual(['team', 'solo']);
    }
  });

  it('leaves shared chrome in no world', () => {
    for (const path of [
      '/home',
      '/settings',
      '/settings/credentials',
      '/settings/themes',
      '/whats-new',
      '/feedback',
      '/setup',
      '/',
    ]) {
      expect(audiencesForRoute(path)).toEqual([]);
    }
  });

  it('matches whole segments, not raw prefixes', () => {
    expect(audiencesForRoute('/boardroom')).toEqual([]);
    expect(audiencesForRoute('/usagex')).toEqual([]);
    expect(audiencesForRoute('/agentsx')).toEqual([]);
    expect(audiencesForRoute('/teamx')).toEqual([]);
  });
});

describe('resolveAudience', () => {
  it('never yanks a solo user off a shared workspace page', () => {
    expect(resolveAudience('/team/analysis', 'solo')).toBeNull();
    expect(resolveAudience('/projects/p1', 'solo')).toBeNull();
  });

  it('switches solo to team for a team-only mode', () => {
    expect(resolveAudience('/team/retro', 'solo')).toBe('team');
    expect(resolveAudience('/team/poker/board', 'solo')).toBe('team');
  });

  it('switches agents to the canonical workspace owner', () => {
    expect(resolveAudience('/projects', 'agents')).toBe('team');
  });

  it('switches anyone into agents for an agentwatch route', () => {
    expect(resolveAudience('/agents/usage', 'team')).toBe('agents');
    expect(resolveAudience('/agents/usage', 'solo')).toBe('agents');
  });

  it('stays put on shared chrome', () => {
    expect(resolveAudience('/home', 'solo')).toBeNull();
    expect(resolveAudience('/settings', 'agents')).toBeNull();
  });
});
