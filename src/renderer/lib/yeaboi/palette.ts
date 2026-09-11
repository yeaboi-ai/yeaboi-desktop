// Find anything (Cmd+K): the window's answer to the terminal's `g`
// jump-into-feature key.
//
// The terminal jumps by mode key because a mode card is the only destination
// it has. A window has more of them — a page, a project, a saved run, a
// setting, an action — so the palette is over all of them at once, and every
// one is reachable by typing part of its name. Pure (test/palette.test.ts):
// each source becomes hits from data handed in, and ranking is a function of
// the hits and the text; the dialog is a list and a keydown handler over it.

import {
  AUDIENCES,
  WORLD_COPY,
  audiencesForRoute,
  sessionsHref,
  type Audience,
} from '@shared/audience';
import type { RailLucideName } from '@shared/rail';
import type { UpdateState } from '@shared/update';
import type { RailDestination } from '@/lib/nav/rail-catalogue';
import { allCards, type Capabilities } from './capabilities';
import type { ShapedSession } from './sessions';
import type { SettingField } from './settings';
import { SETTINGS_TABS, type SettingsTab } from './settings-tabs';
import { MODE_ROUTES } from './tips';

export type HitKind = 'page' | 'mode' | 'session' | 'run' | 'setting' | 'action';

export type PaletteGroup =
  'sessions' | 'runs' | 'modes' | 'work' | 'settings' | 'about' | 'actions';

/** The headings, in the order the list shows them. */
export const PALETTE_GROUPS: readonly { key: PaletteGroup; title: string }[] = [
  { key: 'sessions', title: 'Sessions' },
  { key: 'runs', title: 'Runs' },
  { key: 'modes', title: 'Modes' },
  { key: 'work', title: 'Work' },
  { key: 'settings', title: 'Settings' },
  { key: 'about', title: 'About the app' },
  { key: 'actions', title: 'Actions' },
];

export type PaletteActionId = 'check-updates' | 'ask-niko' | `switch-world:${Audience}`;

export interface PaletteHit {
  id: string;
  kind: HitKind;
  title: string;
  /** A second name the row answers to as its title: a mode's registry name. */
  alias?: string;
  /** The row's second line; empty when the title says it all. */
  detail: string;
  group: PaletteGroup;
  /** Set only when the destination belongs to another world. */
  world: Audience | null;
  icon: RailLucideName;
  /** Lowercase words a search may also land on: a route, an env name, a synonym. */
  keywords: readonly string[];
  /** A mode the sidecar cannot run yet stays listed, muted. */
  available: boolean;
  href?: string;
  action?: PaletteActionId;
}

export const PALETTE_PLACEHOLDER = 'Find anything';
export const PALETTE_EMPTY = 'Nothing by that name.';
export const PALETTE_UNAVAILABLE = 'not configured';

/** The modifier on its own, for a hint about holding it rather than a chord. */
export function modKeyName(platform: string): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl';
}

/** The modifier's glyph as the keycaps draw it, ready for a key to follow. */
export function modGlyph(platform: string): string {
  return platform === 'darwin' ? '⌘' : `${modKeyName(platform)}+`;
}

const SYSTEM_TAB = '/settings/system';
const PROVIDER_ALWAYS = new Set(['LLM_PROVIDER', 'LLM_MODEL']);
/** A card whose route is a settings page stays a page: "Settings" is not a run. */
const NOT_A_MODE = new Set(['settings']);

/** The glyph a saved run carries, by the engine's mode name. */
const SESSION_ICONS: Record<string, RailLucideName> = {
  planning: 'NotebookPen',
  analysis: 'ChartLine',
  standup: 'Mic',
  retro: 'MessagesSquare',
  reporting: 'Presentation',
  ship: 'Rocket',
  review: 'CalendarCheck',
};

const lower = (text: string): string => text.trim().toLowerCase();

/** The world a route belongs to when it is not the reader's own, else null. */
export function worldOf(route: string, audience: Audience): Audience | null {
  const worlds = audiencesForRoute(route);
  if (worlds.length === 0 || worlds.includes(audience)) return null;
  return worlds[0] ?? null;
}

/**
 * Every page, with the modes folded in. A mode's hub is a registered page, so
 * the hub takes the card's title and description rather than appearing twice;
 * the registry name stays as an alias so it still finds the row. Without
 * capabilities the pages are listed as pages.
 */
export function pageHits(
  destinations: readonly RailDestination[],
  caps: Capabilities | null,
  audience: Audience,
): PaletteHit[] {
  const cards = new Map<string, { title: string; description: string; available: boolean }>();
  if (caps) {
    for (const card of allCards(caps)) {
      if (NOT_A_MODE.has(card.key)) continue;
      const route = MODE_ROUTES[card.key];
      if (route && !cards.has(route)) cards.set(route, card);
    }
  }
  return destinations.map((entry) => {
    const card = cards.get(entry.route);
    return {
      id: `${card ? 'mode' : 'page'}:${entry.route}`,
      kind: card ? 'mode' : 'page',
      title: card ? card.title : entry.label,
      ...(card ? { alias: entry.label } : {}),
      detail: card ? card.description : '',
      group: entry.group,
      world: worldOf(entry.route, audience),
      icon: entry.icon,
      keywords: [lower(entry.title), lower(entry.route)],
      available: card ? card.available : true,
      href: entry.route,
    };
  });
}

export interface PaletteSession {
  id: string;
  name: string;
}

export function workspaceHits(rows: readonly PaletteSession[], audience: Audience): PaletteHit[] {
  const base = sessionsHref(audience);
  return rows.map((row) => ({
    id: `workspace:${row.id}`,
    kind: 'session',
    title: row.name,
    detail: '',
    group: 'sessions',
    world: null,
    icon: 'NotebookPen',
    keywords: ['session', 'workspace'],
    available: true,
    href: `${base}/${row.id}`,
  }));
}

/** Saved runs, newest first as shaped. A row lands where its mode lists it. */
export function runHits(rows: readonly ShapedSession[]): PaletteHit[] {
  return rows.map((row) => ({
    id: `run:${row.key}`,
    kind: 'run',
    title: row.title,
    detail: row.title === row.modeTitle ? row.when : `${row.modeTitle}, ${row.when}`,
    group: 'runs',
    world: null,
    icon: SESSION_ICONS[row.session.mode] ?? 'Sunrise',
    keywords: [lower(row.modeTitle), lower(row.session.mode), 'session', 'run'],
    available: true,
    href: row.route,
  }));
}

/** The settings tab that draws a section; unknown sections are System's extras. */
export function settingsTabFor(
  section: string,
  tabs: readonly SettingsTab[] = SETTINGS_TABS,
): SettingsTab | undefined {
  return (
    tabs.find((tab) => tab.sections.includes(section)) ??
    tabs.find((tab) => tab.route === SYSTEM_TAB)
  );
}

export function settingHref(
  field: Pick<SettingField, 'section'>,
  tabs: readonly SettingsTab[] = SETTINGS_TABS,
): string {
  return settingsTabFor(field.section, tabs)?.route ?? SYSTEM_TAB;
}

/**
 * One hit per setting, named by its label and landing on its tab. A value is
 * never a keyword: a secret's preview is not something to search by. The
 * provider section shows only the live provider's rows, so an unset row of
 * another provider would land on a page that does not draw it.
 */
export function settingHits(
  fields: readonly SettingField[],
  tabs: readonly SettingsTab[] = SETTINGS_TABS,
): PaletteHit[] {
  return fields
    .filter(
      (field) => field.section !== 'provider' || field.is_set || PROVIDER_ALWAYS.has(field.env),
    )
    .map((field) => {
      const tab = settingsTabFor(field.section, tabs);
      return {
        id: `setting:${field.env}`,
        kind: 'setting' as const,
        title: field.label,
        detail: tab ? `${tab.title} settings` : 'Settings',
        group: 'settings' as const,
        world: null,
        icon: 'SlidersHorizontal' as const,
        keywords: [lower(field.env), lower(field.section), 'setting'],
        available: true,
        href: tab?.route ?? SYSTEM_TAB,
      };
    });
}

/** What the palette can do besides open a page. */
export function actionHits(
  audience: Audience,
  update: UpdateState | null,
  worlds: readonly Audience[] = AUDIENCES,
): PaletteHit[] {
  const hits: PaletteHit[] = [
    {
      id: 'action:new-session',
      kind: 'action',
      title: 'New session',
      detail: '',
      group: 'actions',
      world: null,
      icon: 'NotebookPen',
      keywords: ['create', 'add', 'session'],
      available: true,
      href: `${sessionsHref(audience)}?new=1`,
    },
  ];
  // `worlds` is what the build offers, so a one-world launch emits no
  // switch-world action at all.
  for (const world of worlds) {
    if (world === audience) continue;
    hits.push({
      id: `action:switch-world:${world}`,
      kind: 'action',
      title: `Switch to ${WORLD_COPY[world].title}`,
      detail: '',
      group: 'actions',
      world: null,
      icon: 'Globe',
      keywords: ['world', 'switch', lower(WORLD_COPY[world].title)],
      available: true,
      action: `switch-world:${world}`,
    });
  }
  if (update?.kind !== 'unsupported') {
    hits.push({
      id: 'action:check-updates',
      kind: 'action',
      title: 'Check for updates',
      detail: '',
      group: 'actions',
      world: null,
      icon: 'Megaphone',
      keywords: ['update', 'version', 'upgrade'],
      available: true,
      action: 'check-updates',
    });
  }
  hits.push({
    id: 'action:ask-niko',
    kind: 'action',
    title: 'Ask Niko',
    detail: '',
    group: 'actions',
    world: null,
    icon: 'Sparkles',
    keywords: ['niko', 'assistant', 'chat', 'help', 'ask'],
    available: true,
    action: 'ask-niko',
  });
  return hits;
}

const RESTING: ReadonlySet<HitKind> = new Set(['page', 'mode', 'action']);

function parentsOf(href: string): string[] {
  const parents: string[] = [];
  for (let cut = href.lastIndexOf('/'); cut > 0; cut = href.lastIndexOf('/', cut - 1)) {
    parents.push(href.slice(0, cut));
  }
  return parents;
}

/** With nothing typed the list rests on what there is: pages, modes and
 *  actions, and only the top of each family. A page under a listed page is a
 *  step of it, and shows once its name is typed. */
function resting(hits: readonly PaletteHit[]): PaletteHit[] {
  const listed = hits.filter((hit) => RESTING.has(hit.kind));
  const hrefs = new Set(listed.map((hit) => hit.href ?? ''));
  return listed.filter(
    (hit) => !hit.href || !parentsOf(hit.href).some((parent) => hrefs.has(parent)),
  );
}

function titleWords(title: string): string[] {
  return lower(title)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** 0 = title starts with it, 1 = a title word does, 2 = the title holds it,
 *  3 = only the detail, keywords or route do; -1 = no match. */
function rankOf(hit: PaletteHit, needle: string, words: string[]): number {
  const names = [hit.title, hit.alias ?? ''].filter(Boolean).map(lower);
  const extras = [lower(hit.detail), ...hit.keywords, lower(hit.href ?? '')];
  const inName = (word: string): boolean => names.some((name) => name.includes(word));
  const anywhere = (word: string): boolean =>
    inName(word) || extras.some((text) => text.includes(word));
  if (!words.every(anywhere)) return -1;
  if (names.some((name) => name.startsWith(needle))) return 0;
  const starts = names.flatMap(titleWords);
  if (words.every((word) => starts.some((start) => start.startsWith(word)))) return 1;
  if (words.every(inName)) return 2;
  return 3;
}

/**
 * The hits matching what has been typed, best first.
 *
 * A title that starts with the text beats one whose later word does, which
 * beats one that merely holds it, which beats a match on a keyword or route:
 * that is what makes "se" reach Sessions before a page whose second word is
 * Setup. At equal rank a mode the sidecar cannot run sinks below one it can,
 * the reader's own world comes before another, and then source order wins.
 * With nothing typed the list rests on the top of every family: what there
 * is, before what has been.
 */
export function rankHits(hits: readonly PaletteHit[], query: string): PaletteHit[] {
  const needle = lower(query);
  if (!needle) return resting(hits);
  const words = needle.split(/\s+/).filter(Boolean);
  return hits
    .map((hit, index) => ({ hit, index, rank: rankOf(hit, needle, words) }))
    .filter((row) => row.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(!a.hit.available) - Number(!b.hit.available) ||
        Number(a.hit.world !== null) - Number(b.hit.world !== null) ||
        a.index - b.index,
    )
    .map((row) => row.hit);
}

export interface PaletteSection {
  key: PaletteGroup;
  title: string;
  hits: PaletteHit[];
}

/** The ranked list under its headings, in heading order, empty headings gone. */
export function groupHits(hits: readonly PaletteHit[]): PaletteSection[] {
  return PALETTE_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    hits: hits.filter((hit) => hit.group === group.key),
  })).filter((section) => section.hits.length > 0);
}

/** Move a selection by `step`, stopping at both ends rather than wrapping. */
export function moveSelection(selected: number, step: number, count: number): number {
  if (count === 0) return 0;
  return Math.min(count - 1, Math.max(0, selected + step));
}

/** The chat's `/help` and the shell's `?` open one sheet, so they share an event. */
export const SHORTCUTS_EVENT = 'yeaboi:shortcuts';

export function openShortcuts(): void {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT));
}

/**
 * Whether a bare key (`?`) should be swallowed by whatever is focused.
 *
 * Without this the sheet opens mid-sentence the first time anyone types a
 * question mark into the composer.
 */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return (
    tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true
  );
}

export interface Shortcut {
  keys: string;
  what: string;
}

/**
 * The shortcuts sheet — what `?` and `/help` both show.
 *
 * Four terminal gestures are missing on purpose, and each is missing because
 * the constraint that produced it is gone: double-tap Space (a terminal cannot
 * see a key being released), Ctrl+V for a screenshot (a window pastes with the
 * paste key), Esc Esc (there is no ambiguity to disambiguate here), and the
 * too-small guard (a window has a minimum size).
 */
export function shortcuts(platform: string): Shortcut[] {
  const mod = platform === 'darwin' ? 'Cmd' : 'Ctrl';
  return [
    { keys: `${mod}+K`, what: 'go anywhere' },
    { keys: '?', what: 'this sheet' },
    { keys: 'Enter', what: 'send the message' },
    { keys: 'Shift+Enter', what: 'a new line' },
    { keys: '/', what: 'commands, at the start of the box' },
    { keys: `${mod}+V`, what: 'paste — text, or a screenshot straight into the chat' },
    { keys: `${mod}+Y`, what: 'call the ducks out' },
    { keys: 'Esc', what: 'close what is open · stop a running turn' },
  ];
}
