// Find anything: every destination becomes a hit, the ranking puts what was
// typed first, the headings keep their order, and the copy keeps its case.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import { PALETTE_COMMAND } from '../src/shared/menu';
import { RAIL_LUCIDE_ICONS } from '../src/shared/rail';
import {
  railCatalogue,
  railDestinations,
  railGroupFor,
} from '../src/renderer/lib/nav/rail-catalogue';
import type { Capabilities } from '../src/renderer/lib/yeaboi/capabilities';
import {
  PALETTE_EMPTY,
  PALETTE_GROUPS,
  PALETTE_PLACEHOLDER,
  PALETTE_UNAVAILABLE,
  actionHits,
  groupHits,
  modGlyph,
  pageHits,
  projectHits,
  rankHits,
  sessionHits,
  settingHits,
  settingsTabFor,
  worldOf,
  type PaletteHit,
} from '../src/renderer/lib/yeaboi/palette';
import { shapeSessions, type RecentSession } from '../src/renderer/lib/yeaboi/sessions';
import type { SettingField } from '../src/renderer/lib/yeaboi/settings';
import { SETTINGS_TABS } from '../src/renderer/lib/yeaboi/settings-tabs';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const REGISTERED = new Set(registry.routes.map((route) => route.path));
const ICONS = new Set<string>(RAIL_LUCIDE_ICONS);
const DESTINATIONS = railDestinations();

const card = (key: string, title: string, available = true) => ({
  key,
  title,
  description: `runs the ${title.toLowerCase()}`,
  available,
  color: 'green',
});

const CAPS: Capabilities = {
  categories: [],
  modes: [
    card('daily-standup', 'Daily Standup'),
    card('retro', 'Retro', false),
    card('team-analysis', 'Analysis'),
  ],
  solo: [card('weekly-review', 'Weekly Review')],
  agents: [card('agent-usage', 'Agent Usage')],
};

const field = (over: Partial<SettingField>): SettingField => ({
  env: 'SLACK_BOT_TOKEN',
  label: 'Slack bot token',
  section: 'slack',
  secret: true,
  value: 'xoxb-…',
  is_set: true,
  choices: [],
  choice_labels: {},
  active_choice: '',
  default: '',
  action: '',
  help_url: '',
  help_scope: '',
  ...over,
});

const row = (over: Partial<RecentSession>): RecentSession => ({
  session_id: 's1',
  run_id: 1,
  mode: 'standup',
  title: '',
  created_at: '2026-09-03T09:00:00Z',
  last_modified: '2026-09-03T09:00:00Z',
  project_id: '',
  ...over,
});

const NOW = new Date('2026-09-04T12:00:00Z');

const prose = (text: string) => {
  expect(text).toMatch(/^[A-Z]/);
  expect(text).not.toMatch(/[·→—]/);
  expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
};

describe('worldOf', () => {
  it("names the world a route belongs to only when it is not the reader's", () => {
    expect(worldOf('/solo/review', 'team')).toBe('solo');
    expect(worldOf('/team/retro', 'solo')).toBe('team');
    expect(worldOf('/agents/projects', 'team')).toBe('agents');
    expect(worldOf('/team/retro', 'team')).toBeNull();
    expect(worldOf('/projects', 'solo')).toBeNull();
    expect(worldOf('/whats-new', 'agents')).toBeNull();
  });
});

describe('pageHits', () => {
  const hits = pageHits(DESTINATIONS, CAPS, 'team');

  it('lists every page that opens without an id, once', () => {
    const hrefs = hits.map((hit) => hit.href!);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(REGISTERED.has(href), `${href} is not registered`).toBe(true);
      expect(href).not.toMatch(/:/);
    }
    expect(hrefs).not.toContain('/home');
    expect(hrefs).not.toContain('/settings');
  });

  it("keeps the rail's groups and glyphs", () => {
    for (const hit of hits) {
      expect(hit.group).toBe(railGroupFor(hit.href!));
      expect(ICONS.has(hit.icon), `${hit.icon} is not a rail glyph`).toBe(true);
    }
  });

  it('folds a mode into its start page', () => {
    const standup = hits.find((hit) => hit.href === '/team/standup')!;
    expect(standup.kind).toBe('mode');
    expect(standup.title).toBe('Daily Standup');
    expect(standup.detail).toBe('runs the daily standup');
    expect(standup.alias).toBe('Standup');
    expect(standup.keywords).toContain('standup');
    expect(standup.available).toBe(true);
    expect(hits.filter((hit) => hit.title === 'Daily Standup')).toHaveLength(1);
  });

  it('folds a mode onto its hub, never its new-run page', () => {
    const analysis = hits.filter((hit) => hit.title === 'Analysis');
    expect(analysis).toHaveLength(1);
    expect(analysis[0]!.href).toBe('/team/analysis');
    expect(analysis[0]!.kind).toBe('mode');
    expect(hits.find((hit) => hit.href === '/team/analysis/new')?.title).toBe('Analysis · New');
  });

  it('keeps an unavailable mode, marked', () => {
    const retro = hits.find((hit) => hit.href === '/team/retro')!;
    expect(retro.kind).toBe('mode');
    expect(retro.available).toBe(false);
  });

  it('leaves the settings pages as pages', () => {
    const appearance = hits.find((hit) => hit.href === '/settings/appearance')!;
    expect(appearance.kind).toBe('page');
    expect(appearance.title).toBe('Appearance');
    // A section folded into another is not a second place to go, so the
    // palette does not offer it twice under two names.
    expect(hits.some((hit) => hit.href === '/settings/credentials')).toBe(false);
  });

  it('lists the pages as pages when the sidecar has not answered', () => {
    const bare = pageHits(DESTINATIONS, null, 'team');
    expect(bare).toHaveLength(hits.length);
    expect(bare.every((hit) => hit.kind === 'page')).toBe(true);
  });

  it("labels the other worlds' pages with their world", () => {
    const fromSolo = pageHits(DESTINATIONS, CAPS, 'solo');
    expect(fromSolo.find((hit) => hit.href === '/team/retro')?.world).toBe('team');
    expect(fromSolo.find((hit) => hit.href === '/solo/review')?.world).toBeNull();
    expect(hits.find((hit) => hit.href === '/solo/review')?.world).toBe('solo');
  });

  it("covers every world's rail catalogue", () => {
    const hrefs = new Set(hits.map((hit) => hit.href));
    for (const audience of AUDIENCES) {
      for (const entry of railCatalogue(audience)) expect(hrefs.has(entry.route)).toBe(true);
    }
  });
});

describe('projectHits', () => {
  it("opens a project in the world's own list", () => {
    const projects = [{ id: 'p1', name: 'Pond' }];
    expect(projectHits(projects, 'team')[0]!.href).toBe('/projects/p1');
    expect(projectHits(projects, 'solo')[0]!.href).toBe('/projects/p1');
    expect(projectHits(projects, 'agents')[0]!.href).toBe('/agents/projects/p1');
    expect(projectHits(projects, 'team')[0]!.title).toBe('Pond');
    expect(projectHits(projects, 'team')[0]!.group).toBe('projects');
  });
});

describe('sessionHits', () => {
  const cards = [{ key: 'daily-standup', title: 'Daily Standup' }];

  it('says the mode and the day, and lands where the mode lists the run', () => {
    const [hit] = sessionHits(shapeSessions([row({ title: 'Standup 3 Sep' })], cards, NOW));
    expect(hit!.title).toBe('Standup 3 Sep');
    expect(hit!.detail).toBe('Daily Standup, yesterday');
    expect(hit!.href).toBe('/team/standup');
    expect(hit!.icon).toBe('Mic');
    expect(hit!.keywords).toContain('daily standup');
  });

  it('says only the day when the run has no title of its own', () => {
    const [hit] = sessionHits(shapeSessions([row({})], cards, NOW));
    expect(hit!.title).toBe('Daily Standup');
    expect(hit!.detail).toBe('yesterday');
  });

  it('falls back to the sessions glyph for a mode it does not know', () => {
    const [hit] = sessionHits(shapeSessions([row({ mode: 'poker' })], cards, NOW));
    expect(hit!.icon).toBe('Sunrise');
  });
});

describe('settingHits', () => {
  it('lands a section on the tab that draws it', () => {
    expect(settingsTabFor('slack')?.route).toBe('/settings/credentials');
    expect(settingsTabFor('voice')?.route).toBe('/settings/system');
    expect(settingsTabFor('no-such-section')?.route).toBe('/settings/system');
    for (const tab of SETTINGS_TABS) {
      for (const section of tab.sections) expect(settingsTabFor(section)?.route).toBe(tab.route);
    }
  });

  it('names the field by its label and never searches its value', () => {
    const [hit] = settingHits([field({})]);
    expect(hit!.title).toBe('Slack bot token');
    expect(hit!.detail).toBe('Credentials settings');
    expect(hit!.href).toBe('/settings/credentials');
    expect(hit!.keywords).toContain('slack_bot_token');
    expect(hit!.keywords.join(' ')).not.toContain('xoxb');
  });

  it("lists only the live provider's rows", () => {
    const fields = [
      field({ env: 'LLM_PROVIDER', label: 'Provider', section: 'provider', is_set: false }),
      field({ env: 'LLM_MODEL', label: 'Model', section: 'provider', is_set: false }),
      field({
        env: 'ANTHROPIC_API_KEY',
        label: 'Anthropic key',
        section: 'provider',
        is_set: true,
      }),
      field({ env: 'AWS_REGION', label: 'AWS region', section: 'provider', is_set: false }),
    ];
    expect(settingHits(fields).map((hit) => hit.title)).toEqual([
      'Provider',
      'Model',
      'Anthropic key',
    ]);
  });
});

describe('actionHits', () => {
  it('offers the two other worlds, never the current one', () => {
    const titles = actionHits('team', null).map((hit) => hit.title);
    expect(titles).toContain('Switch to Solo');
    expect(titles).toContain('Switch to Agents');
    expect(titles).not.toContain('Switch to Team');
  });

  it("starts a project in the world's own list", () => {
    expect(actionHits('team', null).find((hit) => hit.title === 'New project')?.href).toBe(
      '/projects?new=1',
    );
    expect(actionHits('agents', null).find((hit) => hit.title === 'New project')?.href).toBe(
      '/agents/projects?new=1',
    );
  });

  it('drops the update check where updates cannot happen', () => {
    const titles = (update: Parameters<typeof actionHits>[1]) =>
      actionHits('team', update).map((hit) => hit.title);
    expect(titles({ kind: 'idle' })).toContain('Check for updates');
    expect(titles({ kind: 'unsupported', reason: 'dev' })).not.toContain('Check for updates');
  });

  it('gives every action either a page or a deed', () => {
    for (const hit of actionHits('solo', { kind: 'idle' })) {
      expect(Boolean(hit.href) !== Boolean(hit.action)).toBe(true);
      expect(ICONS.has(hit.icon)).toBe(true);
    }
  });
});

describe('rankHits', () => {
  const hits = [
    ...pageHits(DESTINATIONS, CAPS, 'team'),
    ...settingHits([field({})]),
    ...actionHits('team', { kind: 'idle' }),
    ...projectHits([{ id: 'p1', name: 'Pond' }], 'team'),
  ];
  const titles = (query: string) => rankHits(hits, query).map((hit) => hit.title);

  it('rests on pages, modes and actions', () => {
    const resting = rankHits(hits, '');
    expect(resting.length).toBeGreaterThan(0);
    expect(resting.every((hit) => ['page', 'mode', 'action'].includes(hit.kind))).toBe(true);
    expect(resting.map((hit) => hit.title)).not.toContain('Pond');
  });

  it('rests on the top of each family and shows a step once typed', () => {
    const resting = rankHits(hits, '').map((hit) => hit.href);
    expect(resting).toContain('/team/standup');
    expect(resting).not.toContain('/team/standup/setup');
    expect(resting).toContain('/settings/system');
    expect(titles('setup')).toContain('Standup · Setup');
    const names = rankHits(hits, '').map((hit) => hit.title);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts a title that starts with the text before one that holds it', () => {
    const order = titles('se');
    expect(order[0]).toMatch(/^Se/);
    const later = order.findIndex((title) => !title.startsWith('Se'));
    expect(later).toBeGreaterThan(0);
    expect(order.slice(0, later).every((title) => title.startsWith('Se'))).toBe(true);
  });

  it('reaches a mode by its registry name before its own pages', () => {
    const order = titles('stand');
    expect(order[0]).toBe('Daily Standup');
    expect(order[1]).toMatch(/^Standup/);
  });

  it("puts the reader's own world before another at equal rank", () => {
    const order = rankHits(hits, 'se');
    const first = order.findIndex((hit) => hit.world === null);
    const other = order.findIndex((hit) => hit.world !== null);
    expect(first).toBe(0);
    expect(other).toBeGreaterThan(first);
  });

  it('narrows by every word typed', () => {
    const order = rankHits(hits, 'standup team');
    expect(order.length).toBeGreaterThan(0);
    expect(
      order.every(
        (hit) => /standup/i.test(hit.title) || hit.keywords.some((k) => k.includes('standup')),
      ),
    ).toBe(true);
  });

  it('reaches a setting by its env name and a route by its path', () => {
    expect(titles('slack_bot')).toContain('Slack bot token');
    expect(titles('/team/retro')).toContain('Retro');
  });

  it('is case-insensitive and sinks what cannot run', () => {
    expect(titles('RETRO')).toContain('Retro');
    const both = rankHits(
      [
        { ...hits.find((hit) => hit.href === '/team/retro')!, id: 'a', title: 'Retro' },
        { ...hits.find((hit) => hit.href === '/team/standup')!, id: 'b', title: 'Retro' },
      ],
      'retro',
    );
    expect(both.map((hit) => hit.id)).toEqual(['b', 'a']);
  });

  it('finds nothing for nonsense', () => {
    expect(rankHits(hits, 'zzqx')).toEqual([]);
  });
});

describe('groupHits', () => {
  it('keeps the headings in order and drops empty ones', () => {
    const order = PALETTE_GROUPS.map((group) => group.key);
    const hits: PaletteHit[] = [
      ...actionHits('team', null),
      ...projectHits([{ id: 'p1', name: 'Pond' }], 'team'),
    ];
    const sections = groupHits(hits);
    expect(sections.map((section) => section.key)).toEqual(['projects', 'actions']);
    for (const section of sections) expect(order).toContain(section.key);
    expect(groupHits([])).toEqual([]);
  });
});

describe('the palette copy', () => {
  it('reads as sentences and headings, not eyebrows', () => {
    prose(PALETTE_PLACEHOLDER);
    prose(PALETTE_EMPTY);
    expect(PALETTE_EMPTY).toMatch(/\.$/);
    expect(PALETTE_UNAVAILABLE).toMatch(/^[a-z]/);
    expect(PALETTE_UNAVAILABLE).not.toMatch(/\.$/);
    for (const group of PALETTE_GROUPS) prose(group.title);
    for (const hit of actionHits('team', { kind: 'idle' })) prose(hit.title);
    prose(PALETTE_COMMAND.label);
  });

  it('draws the modifier the keycaps use', () => {
    expect(modGlyph('darwin')).toBe('⌘');
    expect(modGlyph('win32')).toBe('Ctrl+');
  });
});

describe('the palette in the window', () => {
  const PROVIDERS = read('../src/renderer/components/providers.tsx');
  const PROVIDER = read('../src/renderer/components/providers/palette-provider.tsx');
  const MENU = read('../src/main/menu.ts');
  const SESSION_PAGE = read('../src/renderer/pages/session/session-page.tsx');
  const DIALOG = read('../src/renderer/components/palette/global-palette.tsx');

  it('mounts once, for every page', () => {
    expect(PROVIDERS).toContain('<PaletteProvider>');
    expect(PROVIDERS).toContain('<GlobalPalette />');
  });

  // The title bar it also opened from is gone: this window's chrome is the
  // deck's dock, and the menu keeps the chord.
  it('opens from the Go menu', () => {
    expect(MENU).toContain('PALETTE_COMMAND');
    expect(PROVIDER).toContain('onPalette(');
  });

  it('leaves the chord to the menu', () => {
    expect(PROVIDER).not.toContain("addEventListener('keydown'");
    expect(SESSION_PAGE).not.toContain("'mod+k'");
    expect(PALETTE_COMMAND.accelerator).toBe('CmdOrCtrl+K');
  });
});
