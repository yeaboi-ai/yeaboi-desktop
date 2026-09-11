// The audience split's pure decisions: what the persisted value means, which
// worlds a route belongs to, and where a deep link should switch to.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  audiencesForRoute,
  audiencesShown,
  AUDIENCES,
  isSoloOnlyRoute,
  normalizeAudience,
  resolveAudience,
  soloEnabled,
  WORLD_COPY,
} from '../src/shared/audience';

const ROOT = resolve(import.meta.dirname, '..');

describe('normalizeAudience', () => {
  it('passes both worlds through', () => {
    expect(normalizeAudience('solo')).toBe('solo');
    expect(normalizeAudience('team')).toBe('team');
  });

  it('migrates the pre-split name to team', () => {
    expect(normalizeAudience('humans')).toBe('team');
  });

  it('migrates the pre-merge agents world to solo', () => {
    expect(normalizeAudience('agents')).toBe('solo');
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
  it('claims every agentwatch route for solo alone', () => {
    for (const path of [
      '/agents/usage',
      '/agents/advisor',
      '/agents/security',
      '/agents/projects',
      '/agents/projects/p1',
    ]) {
      expect(audiencesForRoute(path)).toEqual(['solo']);
    }
  });

  it('leaves the run history in no world — every world has one', () => {
    expect(audiencesForRoute('/news')).toEqual([]);
    for (const world of AUDIENCES) expect(resolveAudience('/news', world)).toBeNull();
  });

  it('claims the review of your own week for solo alone', () => {
    expect(audiencesForRoute('/solo/review')).toEqual(['solo']);
    expect(audiencesForRoute('/solo/review/report')).toEqual(['solo']);
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
      '/sessions',
      '/sessions/p1/blueprint',
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
    expect(audiencesForRoute('/solox')).toEqual([]);
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

  it('switches team into solo for the weekly review', () => {
    expect(resolveAudience('/solo/review', 'team')).toBe('solo');
    expect(resolveAudience('/solo/review/report', 'solo')).toBeNull();
  });

  it('switches team into solo for an agentwatch route', () => {
    expect(resolveAudience('/agents/usage', 'team')).toBe('solo');
    expect(resolveAudience('/agents/usage', 'solo')).toBeNull();
  });

  it('stays put on shared chrome', () => {
    expect(resolveAudience('/home', 'solo')).toBeNull();
    expect(resolveAudience('/settings', 'team')).toBeNull();
  });
});

describe('audiencesShown', () => {
  it('offers both worlds when Solo is on', () => {
    expect(audiencesShown(true)).toEqual([...AUDIENCES]);
  });

  it('is Team alone when Solo is hidden — one world, so no chooser', () => {
    expect(audiencesShown(false)).toEqual(['team']);
    expect(audiencesShown(false)).toHaveLength(1);
  });
});

describe('soloEnabled', () => {
  it('is true only for an explicit true — anything else fails closed', () => {
    expect(soloEnabled({ solo_enabled: true })).toBe(true);
    expect(soloEnabled({ solo_enabled: false })).toBe(false);
    expect(soloEnabled({ solo_enabled: 'true' })).toBe(false);
    expect(soloEnabled({})).toBe(false);
    expect(soloEnabled(null)).toBe(false);
    expect(soloEnabled(undefined)).toBe(false);
  });
});

describe('isSoloOnlyRoute', () => {
  it('names the pages the Solo world alone owns', () => {
    for (const path of [
      '/solo/review',
      '/solo/review/report',
      '/agents/usage',
      '/agents/projects/p1',
    ]) {
      expect(isSoloOnlyRoute(path)).toBe(true);
    }
  });

  it('leaves the shared workspace and the chrome alone', () => {
    for (const path of ['/projects', '/team/retro', '/home', '/sessions', '/settings']) {
      expect(isSoloOnlyRoute(path)).toBe(false);
    }
  });
});

describe('WORLD_COPY', () => {
  it('covers every world, in the display order', () => {
    expect(Object.keys(WORLD_COPY)).toEqual([...AUDIENCES]);
    for (const world of AUDIENCES) {
      const copy = WORLD_COPY[world];
      expect(copy.title).toBeTruthy();
      expect(copy.verb).toBeTruthy();
      expect(copy.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('marks the beta world and only it', () => {
    expect(WORLD_COPY.solo.beta).toBe(true);
    expect(WORLD_COPY.team.beta).toBeUndefined();
  });

  // The accents are declared twice — here for JS, and as the --audience-accent
  // tokens the accented chrome reads. Neither may drift from the other.
  it('agrees with the accent tokens in globals.css', () => {
    const css = readFileSync(resolve(ROOT, 'src/renderer/styles/globals.css'), 'utf8');
    for (const world of AUDIENCES) {
      // `team` also seeds bare :root, so match the selector's whole block.
      const block = new RegExp(
        `html\\[data-audience='${world}'\\]\\s*\\{[^}]*?--audience-accent:\\s*([^;]+);`,
      ).exec(css);
      expect(block, `no --audience-accent block for ${world}`).not.toBeNull();
      expect(block![1]!.trim()).toBe(WORLD_COPY[world].accent);
    }
  });
});
