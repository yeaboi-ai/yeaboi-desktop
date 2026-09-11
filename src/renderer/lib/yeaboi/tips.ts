// The tip rotation, as pure functions.
//
// Ported from the TUI's src/yeaboi/ui/shared/_tips.py so both surfaces rotate
// on the same clock and group the gallery the same way. Kept free of React for
// the same reason duck-voice.ts is: the clock logic is the part worth testing,
// and test/ is node-only.

export interface Tip {
  key: string;
  text: string;
  mode_key: string | null;
  is_new: boolean;
  is_beta: boolean;
  /** Landing worlds the tip is true in; absent on a sidecar older than the axis. */
  worlds?: string[];
}

/**
 * The tips a world's home may rotate. A Team-only tip (retro, poker, performance)
 * opens a route the Solo world does not own, and following it flips the world
 * — so the Solo home never shows one. A tip without `worlds` predates the axis
 * and passes.
 */
export function tipsForAudience(tips: Tip[], audience: string): Tip[] {
  return tips.filter((tip) => !tip.worlds || tip.worlds.includes(audience));
}

/** How long each tip holds before the next rotates in. Matches TIP_ROTATE_SECONDS. */
export const TIP_ROTATE_MS = 6_000;

/** Fraction of each window spent fading in and, symmetrically, out. */
export const FADE_FRACTION = 0.16;

/**
 * Mode-card keys → desktop routes.
 *
 * The keys are the ones `/api/meta/capabilities` serves, which are `_MODE_CARDS`
 * keys verbatim — `team-analysis`, not `analysis`. Both the home card grid and a
 * tip's open affordance resolve through this one table.
 */
export const MODE_ROUTES: Record<string, string> = {
  'team-analysis': '/team/analysis',
  // Planning is the session workspace: session → blueprint → plan.
  'project-planning': '/sessions',
  'daily-standup': '/team/standup',
  retro: '/team/retro',
  poker: '/team/poker',
  performance: '/team/performance',
  reporting: '/team/reporting',
  ship: '/team/ship',
  'weekly-review': '/solo/review',
  usage: '/usage',
  settings: '/settings/credentials',
  'agent-usage': '/agents/usage',
  'agent-advisor': '/agents/advisor',
  'agent-security': '/agents/security',
};

/** The route a tip opens, or null when it names no reachable mode. */
export function tipRoute(tip: Pick<Tip, 'mode_key'>): string | null {
  return (tip.mode_key && MODE_ROUTES[tip.mode_key]) || null;
}

/** Where starting a session lands, for the modes whose hub is not the start.
 *  Every other mode starts on its hub. */
export const MODE_START_ROUTES: Record<string, string> = {
  reporting: '/team/reporting/new',
  'team-analysis': '/team/analysis/new',
  poker: '/team/poker/new',
};

/** The route that starts a run of a mode, or null for a key with no page. */
export function startRouteFor(key: string): string | null {
  return MODE_START_ROUTES[key] ?? MODE_ROUTES[key] ?? null;
}

/**
 * The tip index to show at `elapsedMs`, shifted by `offset`.
 *
 * `offset` is the manual browse shift. It relabels which tip occupies each
 * rotation window rather than pinning one, so browsing moves through the list
 * and auto-rotation keeps running from the new position — you can never get
 * stuck on a tip.
 */
export function resolveIndex(elapsedMs: number, offset: number, count: number): number {
  if (count <= 0) return 0;
  const windows = Math.floor(Math.max(0, elapsedMs) / TIP_ROTATE_MS);
  // Offsets go negative when browsing backwards; JS % keeps the sign.
  return (((windows + offset) % count) + count) % count;
}

/**
 * A 0..1 opacity for the current tip so one dissolves out as the next dissolves in.
 *
 * Ramps up over the first `FADE_FRACTION` of the window, holds, then ramps back
 * down over the last.
 */
export function tipBrightness(elapsedMs: number): number {
  const phase = (Math.max(0, elapsedMs) % TIP_ROTATE_MS) / TIP_ROTATE_MS;
  if (phase < FADE_FRACTION) return phase / FADE_FRACTION;
  if (phase > 1 - FADE_FRACTION) return Math.max(0, (1 - phase) / FADE_FRACTION);
  return 1;
}

const LEADING_NON_ALNUM = /^[^A-Za-z0-9]+/;
const TIP_MARKER = 'Tip: ';
/** How far in the marker may sit and still be the prefix rather than prose. */
const MARKER_LIMIT = 6;

/**
 * The tip sentence alone.
 *
 * The server bakes a leading emoji and a literal "Tip: " into every string. In a
 * speech bubble the duck is already the "tip" signal, so both are chrome that
 * would read twice.
 *
 * Cutting at the marker rather than stripping a run of punctuation keeps a tip
 * that opens on a backticked term intact.
 */
export function cleanTipText(text: string): string {
  const marker = text.indexOf(TIP_MARKER);
  if (marker !== -1 && marker <= MARKER_LIMIT) {
    return text.slice(marker + TIP_MARKER.length).trim();
  }
  return text.replace(LEADING_NON_ALNUM, '').trim();
}

export interface TipGroup {
  key: 'modes' | 'workflows' | 'setup';
  title: string;
  tips: Tip[];
}

const AMBIENT_KEYS = new Set(['voice', 'music']);

function isAmbient(tip: Tip): boolean {
  return AMBIENT_KEYS.has(tip.key) || tip.key.startsWith('meta:');
}

/**
 * Split the rotation into the gallery's three sections.
 *
 * The grouping is derived, not stored — a tip carries no category, exactly as in
 * the TUI's All Tips page. Empty groups are dropped.
 */
export function groupTips(tips: Tip[]): TipGroup[] {
  const groups: TipGroup[] = [
    { key: 'modes', title: 'Modes', tips: [] },
    { key: 'workflows', title: 'More workflows', tips: [] },
    { key: 'setup', title: 'Shortcuts & setup', tips: [] },
  ];
  for (const tip of tips) {
    if (tip.mode_key) groups[0]!.tips.push(tip);
    else if (isAmbient(tip)) groups[2]!.tips.push(tip);
    else groups[1]!.tips.push(tip);
  }
  return groups.filter((group) => group.tips.length > 0);
}

/**
 * Every tip as a copy-pasteable Markdown list, mirroring the TUI's "Copy all".
 *
 * `titles` maps a mode key to its card title. The text is the cleaned sentence
 * so a copied list matches the one on screen.
 */
export function buildTipsText(tips: Tip[], titles: Record<string, string> = {}): string {
  const lines = ['# yeaboi — Tips', ''];
  for (const tip of tips) {
    let line = `- ${cleanTipText(tip.text)}`;
    // A maturity caveat outranks a freshness cue, and a line saying both reads
    // as neither.
    if (tip.is_beta) line += ' (BETA)';
    else if (tip.is_new) line += ' (NEW)';
    const title = tip.mode_key ? titles[tip.mode_key] : undefined;
    if (title) line += ` → opens ${title}`;
    lines.push(line);
  }
  return `${lines.join('\n').replace(/\s+$/, '')}\n`;
}

/** How far through the current rotation window, 0→1. Drives the hairline. */
export function tipProgress(elapsedMs: number): number {
  return (Math.max(0, elapsedMs) % TIP_ROTATE_MS) / TIP_ROTATE_MS;
}

// ── the corner dock's geometry, as pure functions ──────────────────────────
//
// Kept out of the component for the same reason the clock is: test/ is
// node-only, so anything decided in JSX cannot be covered.

/** The dock's inset from the window edges (`bottom-6 right-6`). The bubble sits
 *  a further `right-2` inside, so the reserve is 8px conservative. */
export const DOCK_MARGIN = 24;
/** Clearance the bubble keeps from Niko's pill. */
export const DOCK_GAP = 16;
export const DOCK_MAX_WIDTH = 340;
/** Below this the bubble is too cramped to read, and the duck stands alone. */
export const DOCK_MIN_WIDTH = 240;

/**
 * How wide the bubble may grow.
 *
 * Niko's bar is centred on the viewport, so the free right-hand gutter is
 * `(innerWidth - pillWidth) / 2` less the dock's own margin and the gap.
 */
export function dockWidth(innerWidth: number, pillWidth: number): number {
  const gutter = (innerWidth - pillWidth) / 2 - DOCK_MARGIN - DOCK_GAP;
  return Math.min(DOCK_MAX_WIDTH, gutter);
}

/**
 * What the dock shows.
 *
 * `off` — still loading, or the backend served no tips: render nothing.
 * `quiet` — tips turned off: a dimmed duck that turns them back on.
 * `duck` — the duck alone; Niko's bar is open, or the gutter is too narrow.
 * `bubble` — duck plus speech bubble.
 */
export type DockMode = 'off' | 'quiet' | 'duck' | 'bubble';

export interface DockInput {
  /** null until the backend answers, so the dock never flashes on and hides. */
  enabled: boolean | null;
  tipCount: number;
  nikoOpen: boolean;
  innerWidth: number;
  pillWidth: number;
}

export function dockMode({
  enabled,
  tipCount,
  nikoOpen,
  innerWidth,
  pillWidth,
}: DockInput): DockMode {
  if (enabled === null || tipCount <= 0) return 'off';
  if (!enabled) return 'quiet';
  if (nikoOpen) return 'duck';
  return dockWidth(innerWidth, pillWidth) >= DOCK_MIN_WIDTH ? 'bubble' : 'duck';
}
