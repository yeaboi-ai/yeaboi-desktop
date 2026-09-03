// The home's two halves as data: which three rows each shows, and the sentence
// under each word. Pure (test/home.test.ts); the diptych component draws it.

import type { Audience } from '@shared/audience';
import { projectsHref } from '@/lib/nav/sections';
import { relativeDay, type ShapedSession } from './sessions';

export const GLIMPSE_COUNT = 3;

export interface GlimpseRow {
  key: string;
  primary: string;
  secondary: string;
  href: string;
}

export interface GlimpseProject {
  id: string;
  name: string;
  created_at: string;
}

/** The newest projects, three at most. */
export function projectGlimpse(
  projects: GlimpseProject[],
  now: Date,
  audience: Audience = 'team',
): GlimpseRow[] {
  const base = projectsHref(audience);
  return [...projects]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, GLIMPSE_COUNT)
    .map((project) => ({
      key: project.id,
      primary: project.name,
      secondary: relativeDay(project.created_at, now),
      href: `${base}/${project.id}`,
    }));
}

/** Shaped runs as rows: the mode alone when the run has no title of its own. */
export function sessionRows(sessions: ShapedSession[]): GlimpseRow[] {
  return sessions.map((row) => ({
    key: row.key,
    primary: row.title === row.modeTitle ? row.modeTitle : `${row.modeTitle}: ${row.title}`,
    secondary: row.when,
    href: row.route,
  }));
}

/** The newest runs, three at most, already shaped by shapeSessions. */
export function sessionGlimpse(sessions: ShapedSession[]): GlimpseRow[] {
  return sessionRows(sessions.slice(0, GLIMPSE_COUNT));
}

/** The Agents world's right half: each kind and when its report was saved. */
export function agentGlimpse(
  cards: { key: string; title: string }[],
  stamps: Record<string, string>,
  routes: Record<string, string>,
  now: Date,
): GlimpseRow[] {
  return cards
    .filter((card) => routes[card.key])
    .map((card) => ({
      key: card.key,
      primary: card.title,
      secondary: stamps[card.key] ? relativeDay(stamps[card.key]!, now) : 'no report yet',
      href: routes[card.key]!,
    }));
}

export interface HomeHalfCopy {
  word: string;
  lead: string;
  empty: string;
  foot: string;
  href: string;
}

export interface HomeCopy {
  projects: HomeHalfCopy;
  sessions: HomeHalfCopy;
}

/** The sentences on the home. Plain, sentence case, from the reader's side. */
export function homeCopy(audience: Audience): HomeCopy {
  const sessionsLead =
    audience === 'agents'
      ? 'Pick this when you want the whole machine in one report right now.'
      : audience === 'solo'
        ? 'Pick this when you need a standup, a report or an analysis right now.'
        : 'Pick this when you need a standup, a retro or a report right now.';
  return {
    projects: {
      word: 'Projects',
      lead:
        audience === 'agents'
          ? 'Pick this when you want the reports scoped to one repo.'
          : 'Pick this when the work has a name and you will come back.',
      empty: 'Nothing here yet. Create the first project.',
      foot: 'All projects',
      href: projectsHref(audience),
    },
    sessions: {
      word: 'Sessions',
      lead: sessionsLead,
      empty:
        audience === 'agents'
          ? 'No report yet. Open one to run the first pass.'
          : 'Nothing has run yet. Start a session.',
      foot: 'Start a session',
      href: '/sessions',
    },
  };
}

/** What the home says when the sidecar predates the recent-sessions route. */
export const SESSIONS_UNSUPPORTED =
  'This sidecar does not list sessions yet. Open Sessions to start one.';
