// The cross-mode recent-sessions list — the Recent column of the Sessions
// page, and the sessions inside a project.
//
// Both reads go through apiGetOptional: a sidecar older than the route answers
// 404, and null is how a page knows to say so in one sentence rather than
// fail. The shaping is pure (test/sessions.test.ts).

import { isSoloOnlyRoute } from '@shared/audience';
import { apiGetOptional } from './api';
import { MODE_ROUTES } from './tips';

export interface RecentSession {
  session_id: string;
  run_id: number | string;
  /** An engine name (`standup`, `reporting`, `weekly-review`), not a card key. */
  mode: string;
  title: string;
  created_at: string;
  last_modified: string;
  project_id: string;
}

/** Engine mode names whose card key differs. Everything else is the same word. */
export const MODE_KEY_ALIASES: Record<string, string> = {
  standup: 'daily-standup',
  analysis: 'team-analysis',
  planning: 'project-planning',
  review: 'weekly-review',
};

export function cardKeyForMode(mode: string): string {
  return MODE_KEY_ALIASES[mode] ?? mode;
}

export interface ShapedSession {
  key: string;
  /** The row's title, or the mode's when the run has none. */
  title: string;
  modeTitle: string;
  /** "today", "yesterday", "3 days ago", "12 Aug". */
  when: string;
  route: string;
  session: RecentSession;
}

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A calendar-day distance in words. An unparseable stamp comes back as is. */
export function relativeDay(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/** Where a saved run opens. Only the weekly review addresses a run by id;
 *  every other row lands on its mode's hub, which lists it. */
function routeFor(row: RecentSession, cardKey: string): string {
  if (cardKey === 'weekly-review' && Number(row.run_id) > 0) {
    return `/solo/review/report?id=${encodeURIComponent(String(row.run_id))}`;
  }
  return MODE_ROUTES[cardKey] ?? '/sessions';
}

const stamp = (row: RecentSession): string => row.last_modified || row.created_at;

/** Rows ready to draw, newest first, titled from the capability cards. */
/** Drop the runs whose mode lives in a world this build does not offer.
 *  Both the Sessions list and the palette shape their rows here, so this is the
 *  one place a hidden world could still be named by a run that predates it. */
export function visibleSessions(
  rows: readonly ShapedSession[],
  soloEnabled: boolean,
): ShapedSession[] {
  return rows.filter((row) => soloEnabled || !isSoloOnlyRoute(row.route));
}

export function shapeSessions(
  rows: RecentSession[],
  cards: { key: string; title: string }[],
  now: Date,
): ShapedSession[] {
  const titles = new Map(cards.map((card) => [card.key, card.title]));
  return [...rows]
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .map((row) => {
      const cardKey = cardKeyForMode(row.mode);
      const modeTitle = titles.get(cardKey) ?? row.mode;
      return {
        key: `${row.mode}:${row.session_id}:${row.run_id}`,
        title: row.title || modeTitle,
        modeTitle,
        when: relativeDay(stamp(row), now),
        route: routeFor(row, cardKey),
        session: row,
      };
    });
}

export interface RecentQuery {
  limit?: number;
  mode?: string;
  projectId?: string;
}

/** null means the sidecar predates the route. */
export async function loadRecentSessions(query: RecentQuery = {}): Promise<RecentSession[] | null> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.mode) params.set('mode', query.mode);
  if (query.projectId) params.set('project_id', query.projectId);
  const suffix = params.toString();
  const body = await apiGetOptional<{ sessions: RecentSession[] }>(
    `/api/sessions/recent${suffix ? `?${suffix}` : ''}`,
  );
  return body ? body.sessions : null;
}
