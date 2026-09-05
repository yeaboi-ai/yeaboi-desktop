// The mode inventory's pure rules: what a world offers as a one-off run.

import { describe, expect, it } from 'vitest';
import {
  allCards,
  categoryFor,
  menuFor,
  runModesFor,
  type Capabilities,
  type ModeCard,
} from '../src/renderer/lib/yeaboi/capabilities';

const card = (key: string): ModeCard => ({
  key,
  title: key,
  description: `${key} does a thing`,
  available: true,
  color: '#000',
});

const caps: Capabilities = {
  categories: [
    { key: 'humans', title: 'Team', verb: 'v', color: '#0f0' },
    { key: 'agents', title: 'Agents', verb: 'v', color: '#00f' },
  ],
  modes: ['project-planning', 'daily-standup', 'retro', 'poker', 'usage', 'settings'].map(card),
  agents: ['agent-usage', 'agent-security'].map(card),
};

describe('runModesFor', () => {
  it('drops planning and the live views from the Team menu', () => {
    expect(runModesFor(caps, 'team').map((c) => c.key)).toEqual([
      'daily-standup',
      'retro',
      'poker',
    ]);
  });

  it('serves the sidecar Solo menu when there is one', () => {
    const withSolo = { ...caps, solo: ['daily-standup', 'weekly-review', 'usage'].map(card) };
    expect(runModesFor(withSolo, 'solo').map((c) => c.key)).toEqual([
      'daily-standup',
      'weekly-review',
    ]);
  });

  it('trims the room-only modes for Solo on an older sidecar', () => {
    expect(runModesFor(caps, 'solo').map((c) => c.key)).toEqual(['daily-standup']);
  });

  it('offers the agentwatch family to Agents whole', () => {
    expect(runModesFor(caps, 'agents').map((c) => c.key)).toEqual([
      'agent-usage',
      'agent-security',
    ]);
    expect(menuFor(caps, 'agents')).toBe(caps.agents);
  });
});

describe('allCards', () => {
  it('lists every card once, whichever menus carry it', () => {
    const withSolo = { ...caps, solo: ['daily-standup', 'weekly-review'].map(card) };
    const keys = allCards(withSolo).map((c) => c.key);
    expect(keys.filter((k) => k === 'daily-standup')).toHaveLength(1);
    expect(keys).toContain('weekly-review');
    expect(keys).toContain('agent-security');
  });
});

describe('categoryFor', () => {
  it('accepts the pre-rename humans key for Team', () => {
    expect(categoryFor(caps, 'team')?.title).toBe('Team');
    expect(categoryFor(caps, 'agents')?.title).toBe('Agents');
    expect(categoryFor(caps, 'solo')).toBeUndefined();
  });
});
