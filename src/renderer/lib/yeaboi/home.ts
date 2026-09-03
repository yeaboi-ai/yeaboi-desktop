// The home's two halves as data: the question at the head, the sentence under
// each word, the project rows with their run traces, the one-off session rows,
// and the start links. Pure (test/home.test.ts); the diptych component draws it.

import type { Audience } from '@shared/audience';
import { projectsHref } from '@/lib/nav/sections';
import { runModesFor, type Capabilities } from './capabilities';
import { relativeDay, type RecentSession, type ShapedSession } from './sessions';
import { startRouteFor } from './tips';

export const GLIMPSE_COUNT = 3;

/** The most dots a trace draws; the sentence beside it carries the true count. */
export const TRACE_MAX = 14;

/** Hollow dots under a project that has not run anything yet. */
export const TRACE_GHOST = 3;

/** The faintest dot: the oldest run in a long trace. */
const TRACE_FLOOR = 0.3;

export interface GlimpseRow {
  key: string;
  primary: string;
  /** A quiet word after the primary: a report's period, a plan's name. */
  detail?: string;
  secondary: string;
  href: string;
}

export interface GlimpseProject {
  id: string;
  name: string;
  created_at: string;
  /** The engine project the platform row minted; null until the first run. */
  yeaboi_project_id?: string | null;
}

export interface ProjectTrace {
  count: number;
  /** The noun for the newest run ("standup", "report"); "" when nothing ran. */
  lastRun: string;
  /** The newest run's stamp; "" when nothing ran. */
  lastAt: string;
  /** One opacity per dot, oldest first, the newest last and brightest. */
  dots: number[];
}

/** What one run of each wire mode is called in a sentence. */
const RUN_NOUNS: Record<string, string> = {
  planning: 'plan',
  analysis: 'analysis',
  standup: 'standup',
  retro: 'retro',
  reporting: 'report',
  ship: 'ship',
  review: 'weekly review',
};

const runNoun = (mode: string): string => RUN_NOUNS[mode] ?? mode;

const article = (noun: string): string => (/^[aeiou]/i.test(noun) ? 'an' : 'a');

const stamp = (row: RecentSession): string => row.last_modified || row.created_at;

/** A project's runs as a trace: `runs` newest first, as runsByProject gives them. */
export function projectTrace(runs: RecentSession[]): ProjectTrace {
  const count = runs.length;
  const shown = Math.min(count, TRACE_MAX);
  const dots = Array.from({ length: shown }, (_, i) =>
    i === shown - 1 ? 1 : TRACE_FLOOR + ((1 - TRACE_FLOOR) * i) / (shown - 1),
  );
  const newest = runs[0];
  return {
    count,
    lastRun: newest ? runNoun(newest.mode) : '',
    lastAt: newest ? stamp(newest) : '',
    dots,
  };
}

/** The sentence beside a trace: how many runs, and what the newest one was. */
export function traceSentence(trace: ProjectTrace): string {
  if (trace.count === 0) return 'nothing has run here yet';
  const noun = `${article(trace.lastRun)} ${trace.lastRun}`;
  return trace.count === 1 ? `1 run, ${noun}` : `${trace.count} runs, the last ${noun}`;
}

export interface ProjectRow {
  key: string;
  name: string;
  href: string;
  /** The newest run's day, or the project's own when nothing ran. */
  when: string;
  trace: ProjectTrace;
}

const lastActivity = (project: GlimpseProject, trace: ProjectTrace): string =>
  trace.lastAt || project.created_at;

/** The three most recently active projects, each with its run trace. */
export function projectRows(
  projects: GlimpseProject[],
  runs: Map<string, RecentSession[]>,
  now: Date,
  audience: Audience = 'team',
): ProjectRow[] {
  const base = projectsHref(audience);
  return projects
    .map((project) => {
      const trace = projectTrace(runs.get(project.yeaboi_project_id ?? '') ?? []);
      return { project, trace };
    })
    .sort((a, b) =>
      lastActivity(b.project, b.trace).localeCompare(lastActivity(a.project, a.trace)),
    )
    .slice(0, GLIMPSE_COUNT)
    .map(({ project, trace }) => ({
      key: project.id,
      name: project.name,
      href: `${base}/${project.id}`,
      when: relativeDay(lastActivity(project, trace), now),
      trace,
    }));
}

/** A store's own title after its `<Mode> — ` prefix; the whole title otherwise. */
const titleRemainder = (title: string): string => {
  const match = /^[^—]+ — (.+)$/.exec(title);
  return match ? match[1]!.trim() : title.trim();
};

/** A remainder that says nothing the row does not already: a bare day (the
 *  row's stamp says it), or the raw `new-<8hex>-<date>` id a planning session
 *  carries until it is named. A report's month is kept: it is the period. */
const isBareStamp = (text: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) || /^new-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}$/.test(text);

/** The mode as the row's name, and whatever the run's own title adds to it. */
export function sessionLabel(row: ShapedSession): { primary: string; detail?: string } {
  const remainder = titleRemainder(row.session.title);
  if (!remainder || remainder === row.modeTitle || isBareStamp(remainder)) {
    return { primary: row.modeTitle };
  }
  return { primary: row.modeTitle, detail: remainder };
}

/** Shaped runs as rows: the mode's name, then what the run's title adds. */
export function sessionRows(sessions: ShapedSession[]): GlimpseRow[] {
  return sessions.map((row) => ({
    key: row.key,
    ...sessionLabel(row),
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

export interface StartLink {
  key: string;
  label: string;
  href: string;
}

/** The modes a one-off run can be in the world, each at its start route. The
 *  Agents world starts nothing here: its four kinds are the rows themselves. */
export function startLinks(caps: Capabilities | null, audience: Audience): StartLink[] {
  if (!caps || audience === 'agents') return [];
  return runModesFor(caps, audience).flatMap((card) => {
    const href = card.available ? startRouteFor(card.key) : null;
    return href ? [{ key: card.key, label: card.title, href }] : [];
  });
}

export interface HomeHalfCopy {
  word: string;
  /** Three words under the word: what this way of working does. */
  tagline: string;
  lead: string;
  empty: string;
  foot: string;
  href: string;
  /** The one button on the half, when it has one. */
  action?: { label: string; href: string };
}

export interface HomeCopy {
  question: string;
  /** The word before the start links under Sessions. */
  startLabel: string;
  projects: HomeHalfCopy;
  sessions: HomeHalfCopy;
}

/** The sentences on the home. Plain, sentence case, from the reader's side. */
export function homeCopy(audience: Audience): HomeCopy {
  const agents = audience === 'agents';
  const sessionsLead = agents
    ? 'The whole machine in one report, right now. Nothing scoped, nothing carried over.'
    : audience === 'solo'
      ? 'One standup, report or analysis, right now. Nothing carried in, nothing carried over.'
      : 'One standup, retro or report, right now. Nothing carried in, nothing carried over.';
  return {
    question: 'How do we work today?',
    startLabel: 'Start one',
    projects: {
      word: 'Projects',
      tagline: 'Work that remembers.',
      lead: agents
        ? 'Point it at one repo. Every report inside covers just those agents.'
        : 'Plan it once. Every standup, report and analysis inside reads what came before.',
      empty: agents
        ? 'Nothing here yet. Link a repo and its reports will line up here.'
        : 'Nothing here yet. Your runs will line up here.',
      foot: 'All projects',
      href: projectsHref(audience),
      action: { label: 'New project', href: '/projects?new' },
    },
    sessions: {
      word: 'Sessions',
      tagline: 'Work that starts fresh.',
      lead: sessionsLead,
      empty: agents
        ? 'No report yet. Open one to run the first pass.'
        : 'Nothing has run on its own yet.',
      foot: 'All sessions',
      href: '/sessions',
    },
  };
}

/** What the home says when the sidecar predates the recent-sessions route. */
export const SESSIONS_UNSUPPORTED =
  'This sidecar does not list sessions yet. Open Sessions to start one.';
