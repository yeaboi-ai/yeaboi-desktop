// The mode inventory's pure rules: what a world offers as a one-off run.

import { describe, expect, it } from 'vitest';
import {
  allCards,
  categoryFor,
  menuFor,
  runModesFor,
  soloEnabled,
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
    // A current sidecar already carries the Agents family in `solo`, so the
    // fold-in dedupes rather than repeating it.
    const withSolo = {
      ...caps,
      solo: ['daily-standup', 'weekly-review', 'usage', 'agent-usage', 'agent-security'].map(card),
    };
    expect(runModesFor(withSolo, 'solo').map((c) => c.key)).toEqual([
      'daily-standup',
      'weekly-review',
      'agent-usage',
      'agent-security',
    ]);
  });

  it('trims the room-only modes for Solo on an older sidecar', () => {
    // An older sidecar's `solo` predates the merge, so the Agents family is
    // added rather than assumed present.
    expect(runModesFor(caps, 'solo').map((c) => c.key)).toEqual([
      'daily-standup',
      'agent-usage',
      'agent-security',
    ]);
  });

  it('gives the Agents family to Solo, and never to Team', () => {
    expect(menuFor(caps, 'solo').map((c) => c.key)).toContain('agent-usage');
    expect(menuFor(caps, 'team')).toBe(caps.modes);
    expect(menuFor(caps, 'team').map((c) => c.key)).not.toContain('agent-usage');
  });

  it('reads the Solo gate as hidden unless the sidecar says otherwise', () => {
    expect(soloEnabled(caps)).toBe(false);
    expect(soloEnabled({ ...caps, solo_enabled: true })).toBe(true);
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
