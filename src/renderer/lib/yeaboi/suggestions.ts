// Recommended projects for the empty ledger: what the sidecar computed from
// this machine's connections (GET /api/projects/suggestions), and the pure
// rules for what the sheet shows in each state. The one impure export is the
// loader; everything else is testable in the node lane.

import { apiGetOptional } from '@/lib/yeaboi/api';

export interface ProjectSuggestion {
  id: string;
  /** The description in the composer's voice; the row's words. */
  text: string;
  source: string;
  source_label: string;
  subject: string;
  /** One line of numbers: "14 open issues, milestone 4.2 due 12 Sep". */
  facts: string;
  url: string;
  repo_path: string;
  wording: 'ai' | 'facts';
}

export interface SuggestionSheet {
  refreshing: boolean;
  suggestions: ProjectSuggestion[];
  /** The labels read; on the empty stale first sheet, the ones being read. */
  sources: string[];
  /** One sentence per source that could not be read. */
  warnings: string[];
  computed_at: string;
  stale: boolean;
  /** False only when nothing at all can be read: no connection, no agent repos. */
  connected: boolean;
}

/** The sheet, or null on a sidecar without the route. `refresh` asks for a recompute. */
export function loadProjectSuggestions(
  opts: { refresh?: boolean } = {},
): Promise<SuggestionSheet | null> {
  return apiGetOptional<SuggestionSheet>(
    opts.refresh ? '/api/projects/suggestions?refresh=1' : '/api/projects/suggestions',
  );
}

/** How long after a stale sheet to ask again; the backend refreshes meanwhile. */
export const SUGGESTIONS_STALE_RETRY_MS = 4_000;
/** How many times to ask again: a GitHub read plus one model call can take a
 *  minute, and a hung one must not be polled forever. */
export const SUGGESTIONS_MAX_RETRIES = 20;

/** Ask again when the answer was the old sheet, a refresh is running, and the budget is not spent. */
export function shouldRetry(sheet: SuggestionSheet | null | undefined, attempts = 0): boolean {
  return Boolean(sheet && sheet.stale && sheet.refreshing) && attempts < SUGGESTIONS_MAX_RETRIES;
}

/** The line under a suggestion: where the numbers came from. */
export function factsLine(
  suggestion: Pick<ProjectSuggestion, 'source_label' | 'subject' | 'facts'>,
): string {
  return `${suggestion.source_label}, ${suggestion.subject}: ${suggestion.facts}`;
}

/** The one line the empty ledger offers instead of the rows; pressing the
 *  button unfolds them, so nothing is read until asked. */
export const SUGGEST_PROMPT = 'Not sure where to start?';
export const SUGGEST_LABEL = 'Suggest projects';
export const HIDE_SUGGESTIONS_LABEL = 'Hide suggestions';

export const CONNECT_LINE =
  'Connect GitHub, Jira or Linear and yeaboi will suggest projects from what you are working on.';
export const OLDER_LINE = 'Update yeaboi to see suggested projects here.';
export const FAILED_LINE = 'Could not read your connections just now.';
export const SETTINGS_LABEL = 'Settings';
export const RETRY_LABEL = 'Retry';
export const CHECK_AGAIN_LABEL = 'Check again';
export const CONNECTIONS_ROUTE = '/settings/connections';
export const CREDENTIALS_ROUTE = '/settings/credentials';

/** "GitHub, Jira and Notion" from the labels. */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The caption under the skeleton while the sidecar reads the connections. */
export function readingLine(sheet: SuggestionSheet | null | undefined): string {
  const named = sheet && sheet.sources.length > 0 ? listWords(sheet.sources) : 'your connections';
  return `Reading ${named}.`;
}

export type GhostState = 'loading' | 'rows' | 'note' | 'slow' | 'older';

/** What the empty ledger shows: undefined is not settled, null an older
 *  sidecar, `exhausted` that the polling budget ran out mid-refresh, `failed`
 *  that the request itself did not answer — which is not the same as a sidecar
 *  too old to have the route. */
export function ghostState(
  sheet: SuggestionSheet | null | undefined,
  exhausted = false,
  failed = false,
): GhostState {
  if (failed) return 'note';
  if (sheet === undefined) return 'loading';
  if (sheet === null) return 'older';
  if (sheet.suggestions.length > 0) return 'rows';
  if (sheet.stale && sheet.refreshing) return exhausted ? 'slow' : 'loading';
  return 'note';
}

export interface EmptyNote {
  text: string;
  /** A second line: what failed, when something else was read fine. */
  detail?: string;
  link?: { href: string; label: string };
  /** The retry button's label; absent when asking again would change nothing. */
  retry?: string;
}

/** The one small line for a sheet with no rows: what is still being read,
 *  what to connect, what failed, or that all is quiet. */
export function emptyNote(
  sheet: SuggestionSheet | null,
  exhausted = false,
  failed = false,
): EmptyNote {
  if (failed) return { text: FAILED_LINE, retry: RETRY_LABEL };
  const state = ghostState(sheet, exhausted);
  if (sheet === null || state === 'older') return { text: OLDER_LINE };
  if (state === 'slow') {
    const named = sheet.sources.length > 0 ? listWords(sheet.sources) : 'your connections';
    return { text: `Still reading ${named}. This can take a minute.`, retry: CHECK_AGAIN_LABEL };
  }
  if (!sheet.connected) {
    return { text: CONNECT_LINE, link: { href: CONNECTIONS_ROUTE, label: SETTINGS_LABEL } };
  }
  const quiet =
    sheet.sources.length > 0 ? `Nothing open in ${listWords(sheet.sources)} right now.` : '';
  const failedSources = sheet.warnings.map((warning) => `${warning}.`).join(' ');
  const credentials = { href: CREDENTIALS_ROUTE, label: SETTINGS_LABEL };
  if (failedSources && !quiet) {
    return {
      text: `${failedSources} Check the credentials in Settings.`,
      link: credentials,
      retry: RETRY_LABEL,
    };
  }
  if (failedSources)
    return { text: quiet, detail: failedSources, link: credentials, retry: RETRY_LABEL };
  return {
    text: `${quiet || 'Nothing to suggest yet.'} Describe your first project above.`,
    retry: RETRY_LABEL,
  };
}
