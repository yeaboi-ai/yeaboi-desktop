// settings.json is a file a human can edit, so every one of these asserts
// that a bad value produces a rail rather than a crash — and that the defaults
// survive their own normalisation unchanged.

import { describe, expect, it } from 'vitest';
import { AUDIENCES, sessionsHref } from '../src/shared/audience';
import {
  RAIL_DEFAULTS,
  RAIL_LIMITS,
  RAIL_LUCIDE_ICONS,
  RESERVED_RAIL_IDS,
  isRailLucideName,
  mergeRailPrefs,
  newRailItemId,
  normalizeRailItem,
  normalizeRailItems,
  normalizeRailPrefs,
  railDefaultsFor,
  type RailItem,
} from '../src/shared/rail';

const item = (over: Partial<RailItem> = {}): RailItem => ({
  id: 'x1',
  route: '/team/standup',
  label: 'Standup',
  icon: { kind: 'lucide', name: 'Mic' },
  ...over,
});

const PNG = `data:image/png;base64,${'A'.repeat(64)}`;

describe('RAIL_DEFAULTS', () => {
  it('draws Sessions, Runs and Board in every world', () => {
    for (const audience of AUDIENCES) {
      expect(RAIL_DEFAULTS[audience].map((i) => i.label)).toEqual(['Sessions', 'Runs', 'Board']);
      expect(RAIL_DEFAULTS[audience][0]!.route).toBe(sessionsHref(audience));
      expect(RAIL_DEFAULTS[audience][1]!.route).toBe('/runs');
      expect(RAIL_DEFAULTS[audience][2]!.route).toBe('/board');
    }
  });

  it('is itself a fixed point of normalisation', () => {
    expect(normalizeRailPrefs(RAIL_DEFAULTS)).toEqual(RAIL_DEFAULTS);
    for (const audience of AUDIENCES) {
      expect(normalizeRailItems(railDefaultsFor(audience), audience)).toEqual(
        railDefaultsFor(audience),
      );
    }
  });

  it('uses only ids the rail does not draw itself', () => {
    for (const audience of AUDIENCES) {
      for (const entry of RAIL_DEFAULTS[audience]) {
        expect(RESERVED_RAIL_IDS).not.toContain(entry.id);
      }
    }
  });
});

describe('normalizeRailPrefs', () => {
  it.each([undefined, null, 'a rail', 42, []])('falls back to the defaults for %s', (raw) => {
    expect(normalizeRailPrefs(raw)).toEqual(RAIL_DEFAULTS);
  });

  it('touches only the world that is malformed', () => {
    const prefs = normalizeRailPrefs({ team: 'x', solo: [item()] });
    expect(prefs.team).toEqual(RAIL_DEFAULTS.team);
    expect(prefs.solo).toEqual([item()]);
  });

  it('adopts a rail arranged in the retired Agents world into Solo', () => {
    const agents = [item({ id: 'usage', route: '/agents/usage', label: 'Agent Usage' })];
    expect(normalizeRailPrefs({ agents }).solo).toEqual(agents);
  });

  it('adopts it even though every world is written back, so Solo is never absent', () => {
    // normalizeRailPrefs fills every key, so a real settings.json always has a
    // `solo` entry. "Solo has no arrangement" is the defaults, not a missing key.
    const agents = [item({ id: 'usage', route: '/agents/usage', label: 'Agent Usage' })];
    const stored = { ...RAIL_DEFAULTS, agents };
    expect(normalizeRailPrefs(stored).solo).toEqual(agents);
  });

  it('keeps Solo own arrangement when both are stored — two rails cannot merge', () => {
    const agents = [item({ id: 'usage', route: '/agents/usage', label: 'Agent Usage' })];
    const solo = [item()];
    const prefs = normalizeRailPrefs({ solo, agents });
    expect(prefs.solo).toEqual(solo);
    expect(prefs).not.toHaveProperty('agents');
  });

  it('keeps an empty rail empty', () => {
    expect(normalizeRailPrefs({ team: [] }).team).toEqual([]);
  });

  it('caps a world at the limit', () => {
    const many = Array.from({ length: RAIL_LIMITS.items + 3 }, (_, i) =>
      item({ id: `i${i}`, route: `/page-${i}` }),
    );
    expect(normalizeRailPrefs({ team: many }).team).toHaveLength(RAIL_LIMITS.items);
  });
});

describe('normalizeRailItem', () => {
  it('passes a well-formed item through', () => {
    expect(normalizeRailItem(item())).toEqual(item());
    expect(normalizeRailItem(item({ icon: { kind: 'persona', id: 'chef' } }))).toEqual(
      item({ icon: { kind: 'persona', id: 'chef' } }),
    );
    expect(normalizeRailItem(item({ icon: { kind: 'image', dataUrl: PNG } }))).toEqual(
      item({ icon: { kind: 'image', dataUrl: PNG } }),
    );
  });

  it.each([
    ['not an object', 'x'],
    ['no leading slash', item({ route: 'team/standup' })],
    ['a route parameter', item({ route: '/projects/:id' })],
    ['a query string', item({ route: '/sessions?x=1' })],
    ['whitespace', item({ route: '/team /standup' })],
    ['an overlong route', item({ route: `/${'a'.repeat(RAIL_LIMITS.route)}` })],
    ['an empty label', item({ label: '   ' })],
    ['a missing label', { ...item(), label: undefined }],
    ['an unknown icon kind', { ...item(), icon: { kind: 'emoji', value: '🦆' } }],
    ['an unknown glyph', { ...item(), icon: { kind: 'lucide', name: 'NotAnIcon' } }],
    ['an unknown persona', { ...item(), icon: { kind: 'persona', id: 'pirate' } }],
    [
      'an svg image',
      { ...item(), icon: { kind: 'image', dataUrl: 'data:image/svg+xml;base64,AAAA' } },
    ],
    ['a non-data image', { ...item(), icon: { kind: 'image', dataUrl: 'https://x/y.png' } }],
    [
      'an oversize image',
      {
        ...item(),
        icon: {
          kind: 'image',
          dataUrl: `data:image/png;base64,${'A'.repeat(RAIL_LIMITS.imageChars)}`,
        },
      },
    ],
  ])('drops %s', (_label, raw) => {
    expect(normalizeRailItem(raw)).toBeNull();
  });

  it('drops a route this build does not know when told which it knows', () => {
    const known = new Set(['/sessions']);
    expect(normalizeRailItem(item({ route: '/sessions' }), known)).not.toBeNull();
    expect(normalizeRailItem(item({ route: '/team/standup' }), known)).toBeNull();
  });

  it('trims and caps the label', () => {
    const long = `  ${'x'.repeat(RAIL_LIMITS.label + 10)}  `;
    expect(normalizeRailItem(item({ label: long }))!.label).toBe('x'.repeat(RAIL_LIMITS.label));
  });

  it('blanks an id it cannot keep, for the list to settle', () => {
    expect(normalizeRailItem(item({ id: 'has space' }))!.id).toBe('');
    expect(normalizeRailItem({ ...item(), id: 7 })!.id).toBe('');
  });
});

describe('normalizeRailItems', () => {
  it('keeps one item per page, first wins', () => {
    const items = normalizeRailItems(
      [item({ id: 'a', label: 'First' }), item({ id: 'b', label: 'Second' })],
      'team',
    );
    expect(items.map((i) => i.label)).toEqual(['First']);
  });

  it('replaces a bad, reserved or repeated id by its index', () => {
    const items = normalizeRailItems(
      [
        item({ id: 'settings', route: '/a' }),
        item({ id: 'a b', route: '/b' }),
        item({ id: 'dup', route: '/c' }),
        item({ id: 'dup', route: '/d' }),
      ],
      'team',
    );
    expect(items.map((i) => i.id)).toEqual(['item-0', 'item-1', 'dup', 'item-3']);
  });

  it('skips what it cannot draw and keeps counting from what it kept', () => {
    const items = normalizeRailItems(['junk', item({ id: '', route: '/a' })], 'team');
    expect(items).toEqual([item({ id: 'item-0', route: '/a' })]);
  });

  it('applies the known set to the defaults too', () => {
    expect(normalizeRailItems(undefined, 'team', new Set(['/runs']))).toEqual([
      RAIL_DEFAULTS.team[1],
    ]);
  });
});

describe('mergeRailPrefs', () => {
  it('replaces one world whole and leaves the others', () => {
    const next = mergeRailPrefs(RAIL_DEFAULTS, { team: [item()] });
    expect(next.team).toEqual([item()]);
    expect(next.solo).toBe(RAIL_DEFAULTS.solo);
  });

  it('normalises what arrives', () => {
    expect(mergeRailPrefs(RAIL_DEFAULTS, { team: 'nope' }).team).toEqual(RAIL_DEFAULTS.team);
    expect(mergeRailPrefs(RAIL_DEFAULTS, { team: ['junk'] }).team).toEqual([]);
  });

  it('ignores a patch that is not an object', () => {
    expect(mergeRailPrefs(RAIL_DEFAULTS, null)).toBe(RAIL_DEFAULTS);
    expect(mergeRailPrefs(RAIL_DEFAULTS, 'x')).toBe(RAIL_DEFAULTS);
  });

  it('ignores keys that are not worlds', () => {
    expect(mergeRailPrefs(RAIL_DEFAULTS, { humans: [] })).toEqual(RAIL_DEFAULTS);
  });
});

describe('newRailItemId', () => {
  it('mints ids the normaliser keeps, and does not repeat', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const id = newRailItemId();
      expect(normalizeRailItem(item({ id }))!.id).toBe(id);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
});

describe('isRailLucideName', () => {
  it('accepts the list and nothing else', () => {
    for (const name of RAIL_LUCIDE_ICONS) expect(isRailLucideName(name)).toBe(true);
    expect(isRailLucideName('layoutgrid')).toBe(false);
    expect(isRailLucideName(undefined)).toBe(false);
  });

  it('lists every name once', () => {
    expect(new Set(RAIL_LUCIDE_ICONS).size).toBe(RAIL_LUCIDE_ICONS.length);
  });
});
