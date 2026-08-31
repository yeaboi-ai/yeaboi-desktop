// Context-source toggles — the pure half of the Context sources panel.
//
// The value model mirrors the engine contract (yeaboi projects/scope.py):
// null = inherit (every source on, or the project's saved default), [] =
// incognito, else the enabled subset.

export type ContextDeps = string[] | null;

export const CONTEXT_SOURCES = [
  { token: 'retro', label: 'Retro history', blurb: 'Action items, themes and carry-over' },
  { token: 'standup', label: 'Standup history', blurb: 'Blockers, confidence trend and cadence' },
  { token: 'plan', label: 'Latest sprint plan', blurb: 'Sprint framing and roster' },
  { token: 'performance', label: 'Performance', blurb: 'Open 1:1 actions and review focus' },
  { token: 'analysis', label: 'Analysis profile', blurb: 'Team calibration and AC style' },
] as const;

/** The string grammar `standup_config_set` speaks: inherit | none | csv. */
export function serializeContextSpec(deps: ContextDeps): string {
  if (deps === null) return 'inherit';
  if (deps.length === 0) return 'none';
  return deps.join(',');
}

/**
 * Flip one source. Inherit materialises to the full set first, so switching
 * one source off leaves the other four explicitly on; order stays canonical.
 */
export function toggleContextSource(value: ContextDeps, token: string): string[] {
  const current = value === null ? CONTEXT_SOURCES.map((s) => s.token as string) : value;
  const next = new Set(current);
  if (next.has(token)) next.delete(token);
  else next.add(token);
  return CONTEXT_SOURCES.map((s) => s.token as string).filter((t) => next.has(t));
}
