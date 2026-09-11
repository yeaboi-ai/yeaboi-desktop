// A mode's hub — its saved runs, and the one thing to do there — as a
// descriptor a generic page draws from, the way the terminal's _run_mode_hub
// takes its loader and its labels. Pure rows (test/hubs.test.ts); the
// descriptors name registered routes.

import { deleteChat, listChats, type ChatSummary } from './chat';
import { relativeDay } from './sessions';
import { stageLabel } from './chat';

export interface HubRow {
  id: string;
  title: string;
  /** A quiet word after the title: the stage, the labels. */
  detail?: string;
  /** "today", "yesterday", "12 Aug". */
  when: string;
  href: string;
}

export interface HubDescriptor {
  /** The mode card key. */
  key: string;
  /** The hub's own page. */
  route: string;
  title: string;
  subtitle: string;
  newLabel: string;
  newRoute: string;
  emptyLine: string;
  load(): Promise<HubRow[]>;
  remove?(id: string): Promise<void>;
}

/** The planning hub's rows: a plan's name, where it stands, its labels, when it last moved. */
export function hubRows(sessions: readonly ChatSummary[], now: Date, base = '/planning'): HubRow[] {
  return [...sessions]
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .map((session) => ({
      id: session.session_id,
      title: session.title || 'Untitled plan',
      detail: [stageLabel(session.stage), session.project_label, ...(session.tags ?? [])]
        .filter(Boolean)
        .join(', '),
      when: relativeDay(stamp(session), now),
      href: `${base}/${encodeURIComponent(session.session_id)}`,
    }));
}

const stamp = (session: ChatSummary): string => session.last_modified || session.created_at;

export const PLANNING_HUB: HubDescriptor = {
  key: 'project-planning',
  route: '/planning',
  title: 'Planning',
  subtitle: 'Every plan the engine has drafted, newest first.',
  newLabel: 'New plan',
  newRoute: '/planning/new',
  emptyLine: 'No plans yet.',
  load: async () => hubRows(await listChats(), new Date()),
  remove: async (id) => {
    await deleteChat(id);
  },
};

export const HUBS: readonly HubDescriptor[] = [PLANNING_HUB];
