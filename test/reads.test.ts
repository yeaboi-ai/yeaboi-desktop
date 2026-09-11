// The flow: every step is a real mode, worded the way the rest of the app is.

import { describe, expect, it } from 'vitest';
import { FLOW, fallbackFlowKeys, flowFor } from '../src/renderer/lib/yeaboi/reads';
import { MODE_ROUTES } from '../src/renderer/lib/yeaboi/tips';

const TEAM_KEYS = [
  'project-planning',
  'team-analysis',
  'daily-standup',
  'poker',
  'retro',
  'reporting',
  'performance',
  'usage',
];
const SOLO_KEYS = [
  'project-planning',
  'team-analysis',
  'daily-standup',
  'reporting',
  'weekly-review',
];

describe('FLOW', () => {
  it('names only modes the desktop routes', () => {
    for (const step of FLOW) expect(MODE_ROUTES).toHaveProperty(step.key);
  });

  it('is worded like the doors: no arrows, no dot joins, no all-caps words', () => {
    for (const step of FLOW) {
      for (const text of [step.label, step.leaves]) {
        expect(text).not.toMatch(/[→←·]/);
        expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
      }
    }
  });

  it('keys are unique', () => {
    expect(new Set(FLOW.map((s) => s.key)).size).toBe(FLOW.length);
  });
});

describe('flowFor', () => {
  it('covers the whole flow for a Team card set, in flow order', () => {
    expect(flowFor('team', TEAM_KEYS).map((s) => s.key)).toEqual(FLOW.map((s) => s.key));
  });

  it('drops the steps a Solo card set does not carry', () => {
    const keys = flowFor('solo', SOLO_KEYS).map((s) => s.key);
    expect(keys).toEqual(['project-planning', 'team-analysis', 'daily-standup', 'reporting']);
    expect(keys).not.toContain('retro');
    expect(keys).not.toContain('poker');
  });

  it('keeps flow order whatever order the cards come in', () => {
    const shuffled = [...TEAM_KEYS].reverse();
    expect(flowFor('team', shuffled).map((s) => s.key)).toEqual(FLOW.map((s) => s.key));
  });

  it('is a plain filter: a card set without planning has no Plan step', () => {
    expect(flowFor('team', ['daily-standup']).map((s) => s.key)).toEqual(['daily-standup']);
  });
});

describe('fallbackFlowKeys', () => {
  it('gives Team the whole flow and Solo the flow without retro and poker', () => {
    expect(flowFor('team', fallbackFlowKeys('team'))).toEqual([...FLOW]);
    const solo = flowFor('solo', fallbackFlowKeys('solo')).map((s) => s.key);
    expect(solo).toEqual(['project-planning', 'team-analysis', 'daily-standup', 'reporting']);
  });
});
