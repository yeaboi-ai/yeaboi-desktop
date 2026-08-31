// The audience worlds. The desktop, like the TUI's landing split, works with
// one audience at a time: Solo (your own delivery), Team (the scrum ceremonies
// and the planning workspace, run for a roster) or Agents (the agentwatch
// family). Pure — main clamps the persisted value through here and the
// renderer classifies routes through here, so both halves of the split are
// testable in the node lane.

export type Audience = 'solo' | 'team' | 'agents';

export const AUDIENCES: readonly Audience[] = ['solo', 'team', 'agents'];

/** Clamp whatever settings.json holds. `humans` is the pre-split name for the
 *  Team world and migrates on read (the file rewrites itself on the next
 *  set). Anything else means the question was never asked (or the file
 *  predates it) — the chooser's cue. */
export function normalizeAudience(value: unknown): Audience | undefined {
  if (value === 'humans') return 'team';
  return value === 'solo' || value === 'team' || value === 'agents' ? value : undefined;
}

// Route families per world, matched whole-segment so `/board` never claims a
// hypothetical `/boardroom`. The hrefs are the manifest's paths verbatim
// (lib/yeaboi/routes.json) plus the planning-served set from app/routes.tsx.
//
// Solo and Team share the workspace pages: a solo dev runs the same analysis,
// standup, reporting and ship screens. Only the modes that need other people
// in the room — retro, poker, performance — belong to Team alone.
const TEAM_ONLY_PREFIXES = ['/team/retro', '/team/poker', '/team/performance'];

const SHARED_WORKSPACE_PREFIXES = [
  '/team',
  '/projects',
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
 *  chrome (`/home`, `/settings*`, `/whats-new`, `/feedback`, `/setup`). Note
 *  `/usage` is the app's own LLM spend for scrum runs — workspace-side; the
 *  agentwatch usage report is `/agents/usage`. */
export function audiencesForRoute(pathname: string): readonly Audience[] {
  if (matches(pathname, '/agents')) return ['agents'];
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
