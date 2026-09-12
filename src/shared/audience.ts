// The audience worlds. The desktop, like the TUI's landing split, works with
// one audience at a time: Solo (your own delivery, and the agentwatch family
// that watches the agents working alongside you) or Team (the scrum ceremonies
// and the planning workspace, run for a roster). Pure — main clamps the
// persisted value through here and the renderer classifies routes through here,
// so both halves of the split are testable in the node lane.
//
// Solo is hidden at launch: the sidecar's `solo_enabled` decides, and with it
// off there is one world, so every affordance that switches worlds disappears
// rather than offering a list of one (see `audiencesShown`).

export type Audience = 'solo' | 'team';

export const AUDIENCES: readonly Audience[] = ['solo', 'team'];

/** The planning hub for a world. Both worlds land on the same one. */
export function planningHref(_audience: Audience): string {
  return '/planning';
}

/** Clamp whatever settings.json holds. `humans` is the pre-split name for the
 *  Team world and `agents` the pre-merge name for Solo; both migrate on read
 *  (the file rewrites itself on the next set). Anything else means the question
 *  was never asked (or the file predates it) — the chooser's cue. */
export function normalizeAudience(value: unknown): Audience | undefined {
  if (value === 'humans') return 'team';
  if (value === 'agents') return 'solo';
  return value === 'solo' || value === 'team' ? value : undefined;
}

/** The worlds actually on offer. With Solo hidden there is one world, so every
 *  affordance that switches worlds must disappear rather than offer a list of
 *  one — `audiencesShown(x).length > 1` is that condition, in one place. */
export function audiencesShown(soloEnabled: boolean): readonly Audience[] {
  return soloEnabled ? AUDIENCES : ['team'];
}

/** The sidecar's answer to "does this build offer the Solo world?" — one
 *  switch, $YEABOI_SOLO, owned by the Python side. Anything that is not an
 *  explicit `true` means hidden: an older sidecar, a failed fetch, a string
 *  "true". The default can only ever fail closed. */
export function soloEnabled(caps: { solo_enabled?: unknown } | null | undefined): boolean {
  return caps?.solo_enabled === true;
}

/** How a world names itself wherever it is offered — the chooser's cards and
 *  the sidebar's switcher read the same copy. Accents are the TUI's own world
 *  accents, and `styles/globals.css` declares them again as the
 *  `--audience-accent` tokens (audience.test.ts asserts the two agree). */
export interface WorldCopy {
  title: string;
  verb: string;
  capabilities: readonly string[];
  /** A whole beta world wears the chip wherever it is named. */
  beta?: boolean;
  accent: string;
  accentBright: string;
}

export const WORLD_COPY: Record<Audience, WorldCopy> = {
  solo: {
    title: 'Solo',
    verb: 'Run your own show',
    capabilities: ['planning', 'standups', 'reports', 'agent cost', 'agent security'],
    beta: true,
    accent: 'rgb(210, 168, 80)',
    accentBright: 'rgb(245, 200, 110)',
  },
  team: {
    title: 'Team',
    verb: "Run your team's scrum",
    capabilities: ['planning', 'standups', 'retros', 'poker', 'reviews'],
    accent: 'rgb(100, 180, 100)',
    accentBright: 'rgb(80, 220, 120)',
  },
};

// Route families per world, matched whole-segment so `/board` never claims a
// hypothetical `/boardroom`. The hrefs are the manifest's paths verbatim
// (lib/yeaboi/routes.json) plus the planning-served set from app/routes.tsx.
//
// Solo and Team share the workspace pages: a solo dev runs the same analysis,
// standup, reporting and ship screens. Only the modes that need other people
// in the room — retro, poker, performance — belong to Team alone.
const TEAM_ONLY_PREFIXES = ['/team/retro', '/team/poker', '/team/performance'];

// The modes with no team counterpart: a review of your own week has no roster
// to review, and the agentwatch family watches *your* agents. `/agents` keeps
// its paths — the routes manifest is a contract — and changed owner only.
const SOLO_ONLY_PREFIXES = ['/solo', '/agents'];

const SHARED_WORKSPACE_PREFIXES = [
  '/team',
  '/planning',
  '/board',
  '/tickets',
  '/ceremonies',
  '/provenance',
  '/usage',
  '/recordings',
  '/recording',
  '/clip',
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The worlds a pathname belongs to, canonical owner first; `[]` for shared
 *  chrome (`/home`, `/news`, `/settings*`, `/whats-new`, `/feedback`,
 *  `/setup`). The home is every world's menu, so it belongs to none.
 *  Note `/usage`
 *  is the app's own LLM spend for scrum runs — workspace-side; the agentwatch
 *  usage report is `/agents/usage`. */
export function audiencesForRoute(pathname: string): readonly Audience[] {
  if (SOLO_ONLY_PREFIXES.some((prefix) => matches(pathname, prefix))) return ['solo'];
  if (TEAM_ONLY_PREFIXES.some((prefix) => matches(pathname, prefix))) return ['team'];
  if (SHARED_WORKSPACE_PREFIXES.some((prefix) => matches(pathname, prefix)))
    return ['team', 'solo'];
  return [];
}

/** The world to switch to for this route, or null to stay put. A route the
 *  current world already owns never switches (a Solo user opening a shared
 *  `/team/*` page stays Solo); a route owned elsewhere switches to its
 *  canonical owner. This is the deep-link policy, in one place. */
export function resolveAudience(pathname: string, current: Audience): Audience | null {
  const worlds = audiencesForRoute(pathname);
  if (worlds.length === 0 || worlds.includes(current)) return null;
  return worlds[0];
}

/** A route only the Solo world owns — `/solo/*` and, since the merge,
 *  `/agents/*`. The router's guard and the palette's filter both key off this,
 *  so a page cannot be reachable in a world the build does not offer. */
export function isSoloOnlyRoute(pathname: string): boolean {
  const worlds = audiencesForRoute(pathname);
  return worlds.length === 1 && worlds[0] === 'solo';
}
