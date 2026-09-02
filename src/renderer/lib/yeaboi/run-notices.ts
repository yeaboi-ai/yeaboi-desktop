// Which streamed run just finished, and where its result lives.
//
// Every mode run reaches the backend through apiStream, so the terminal line of
// that one stream is the single place a completion can be noticed — there is no
// job table to poll and no server-side event for it (the contract's rule: a
// request-scoped stream is never republished on the ambient feed).

/** Request path → the duck-events key and the route that answers it. */
export const RUNS: readonly { match: RegExp; key: string; route: string }[] = [
  { match: /^\/api\/analysis\/run/, key: 'run.analysis', route: '/analysis' },
  { match: /^\/api\/standup\/run/, key: 'run.standup', route: '/standup' },
  { match: /^\/api\/reporting\/run/, key: 'run.reporting', route: '/reporting' },
  { match: /^\/api\/solo\/review\/run/, key: 'run.review', route: '/solo/review' },
  { match: /^\/api\/roadmap\/analyze/, key: 'run.roadmap', route: '/planning/roadmap' },
  { match: /^\/api\/agents\/[^/]+\/run/, key: 'run.agents', route: '/agents' },
  { match: /^\/api\/ceremonies\/[^/]+\/run/, key: 'run.ceremony', route: '/ceremonies' },
];

/** The line types that end a run. `cancelled` is deliberately absent: you
 *  cancelled it, so you already know. */
const TERMINAL = new Set(['done', 'error']);

export interface RunNotice {
  key: string;
  route: string;
}

/**
 * The notice a finished run deserves, or null.
 *
 * Null covers the three uninteresting cases: a path with no run behind it
 * (chat, anonymize, the voice-pack install), a line that is not terminal, and
 * a cancellation.
 */
export function runNotice(path: string, line: unknown): RunNotice | null {
  const type = (line as { type?: unknown })?.type;
  if (typeof type !== 'string' || !TERMINAL.has(type)) return null;
  const run = RUNS.find((entry) => entry.match.test(path));
  if (!run) return null;
  return type === 'error'
    ? { key: 'run.failed', route: run.route }
    : { key: run.key, route: run.route };
}
