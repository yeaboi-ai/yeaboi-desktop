// The Solo world's own wire: the Today snapshot behind the solo home's strip.
//
// `SoloToday` mirrors the backend's TodaySnapshot field for field (see
// yeaboi.solo.today) — the terminal's Today strip and this one read the same
// builder, so the two surfaces can never disagree about what today is.
// `todayTiles` is the pure half: it owns the formatting and the empty-state
// copy, and it is what the tests pin.

import { apiGetOptional } from './api';

/** Where the snapshot lives. One edit here if the route moves. */
export const TODAY_PATH = '/api/solo/today';

export interface SoloToday {
  project_id: string;
  project_name: string;
  standup_date: string;
  standup_summary: string;
  standup_blockers: string;
  sprint_name: string;
  sprint_day: number;
  sprint_total_days: number;
  confidence_pct: number;
  confidence_label: string;
  confidence_trend: string;
  next_story_id: string;
  next_story_title: string;
  next_sprint_name: string;
  plan_session_id: string;
  plan_scoped: boolean;
  spend_usd: number;
  spend_sessions: number;
  spend_known: boolean;
  warnings: string[];
}

/** null means the sidecar predates the route — the strip hides itself. */
export const loadSoloToday = (): Promise<SoloToday | null> => apiGetOptional<SoloToday>(TODAY_PATH);

export type TodayTileKey = 'yesterday' | 'sprint' | 'next' | 'spend';

export interface TodayTile {
  key: TodayTileKey;
  label: string;
  value: string;
  /** True when the value is the empty-state sentence, so the tile renders muted. */
  empty: boolean;
  route: string;
}

const TREND: Record<string, string> = { improving: '↑', steady: '→', declining: '↓' };

const EMPTY: SoloToday = {
  project_id: '',
  project_name: '',
  standup_date: '',
  standup_summary: '',
  standup_blockers: '',
  sprint_name: '',
  sprint_day: 0,
  sprint_total_days: 0,
  confidence_pct: 0,
  confidence_label: '',
  confidence_trend: '',
  next_story_id: '',
  next_story_title: '',
  next_sprint_name: '',
  plan_session_id: '',
  plan_scoped: false,
  spend_usd: 0,
  spend_sessions: 0,
  spend_known: false,
  warnings: [],
};

/** The four tiles, in the terminal strip's order and with its sentences. Every
 *  field falls back on its own, so a standup without a plan still says so. */
export function todayTiles(today: SoloToday | null): TodayTile[] {
  const t = { ...EMPTY, ...(today ?? {}) };

  let yesterday: string;
  const hasStandup = Boolean(t.standup_date);
  if (hasStandup) {
    yesterday = t.standup_summary || 'a standup ran, with nothing to summarise';
    if (t.standup_blockers) yesterday += ` — blocked: ${t.standup_blockers}`;
  } else {
    yesterday = 'no standup yet — run one';
  }

  let sprint: string;
  const hasSprint = t.sprint_total_days > 0;
  if (hasSprint) {
    sprint = `Sprint day ${t.sprint_day}/${t.sprint_total_days}`;
    if (t.confidence_label) sprint += ` · ${t.confidence_label} (${t.confidence_pct}%)`;
    const trend = TREND[t.confidence_trend] ?? '';
    if (trend) sprint += ` ${trend}`;
  } else {
    sprint = 'no sprint context yet';
  }

  let next: string;
  const hasNext = Boolean(t.next_story_id || t.next_story_title);
  if (hasNext) {
    next = `${t.next_story_id} ${t.next_story_title}`.trim();
    if (t.next_sprint_name) next += ` · ${t.next_sprint_name}`;
  } else if (t.plan_session_id) {
    next = 'your plan has no sprint stories yet';
  } else {
    next = 'no plan yet — plan one';
  }

  let spend: string;
  const hasSpend = t.spend_sessions > 0;
  if (hasSpend) {
    const approx = t.spend_known ? '' : '~';
    const noun = t.spend_sessions === 1 ? 'session' : 'sessions';
    spend = `${approx}$${t.spend_usd.toFixed(2)} across ${t.spend_sessions} ${noun}`;
  } else {
    spend = 'no agent sessions logged this week';
  }

  return [
    {
      key: 'yesterday',
      label: 'Yesterday',
      value: yesterday,
      empty: !hasStandup,
      route: '/team/standup',
    },
    { key: 'sprint', label: 'Sprint', value: sprint, empty: !hasSprint, route: '/team/standup' },
    { key: 'next', label: 'Next', value: next, empty: !hasNext, route: '/team/planning' },
    { key: 'spend', label: 'Agents this week', value: spend, empty: !hasSpend, route: '/usage' },
  ];
}
