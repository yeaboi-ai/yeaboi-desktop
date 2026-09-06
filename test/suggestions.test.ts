// Recommended projects on the empty ledger: the pure rules for what the sheet
// shows in each state, the words it uses, and that the page reads them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECK_AGAIN_LABEL,
  CONNECTIONS_ROUTE,
  CONNECT_LINE,
  CREDENTIALS_ROUTE,
  HIDE_SUGGESTIONS_LABEL,
  OLDER_LINE,
  RETRY_LABEL,
  SETTINGS_LABEL,
  SUGGEST_LABEL,
  SUGGEST_PROMPT,
  SUGGESTIONS_MAX_RETRIES,
  SUGGESTIONS_STALE_RETRY_MS,
  emptyNote,
  FAILED_LINE,
  factsLine,
  ghostState,
  readingLine,
  shouldRetry,
  type SuggestionSheet,
} from '../src/renderer/lib/yeaboi/suggestions';

const sheet = (over: Partial<SuggestionSheet> = {}): SuggestionSheet => ({
  refreshing: false,
  suggestions: [],
  sources: [],
  warnings: [],
  computed_at: '',
  stale: false,
  connected: false,
  ...over,
});

const row = {
  id: 'ab12cd34',
  text: 'Close the 14 open issues on yeaboi-shop before milestone 4.2.',
  source: 'github',
  source_label: 'GitHub',
  subject: 'yeaboi-ai/yeaboi-shop',
  facts: '14 open issues, milestone 4.2 due 12 Sep',
  url: '',
  repo_path: '',
  wording: 'ai' as const,
};

const refreshingSheet = sheet({ stale: true, refreshing: true, connected: true });

describe('ghostState', () => {
  it('is loading until the sidecar answers, and while the first refresh runs', () => {
    expect(ghostState(undefined)).toBe('loading');
    expect(ghostState(refreshingSheet)).toBe('loading');
  });

  it('is slow once the polling budget is spent on a refresh still running', () => {
    expect(ghostState(refreshingSheet, true)).toBe('slow');
    expect(ghostState(sheet({ connected: true, computed_at: 'x' }), true)).toBe('note');
  });

  it('is older on a sidecar without the route', () => {
    expect(ghostState(null)).toBe('older');
  });

  it('shows the rows when there are any', () => {
    expect(ghostState(sheet({ suggestions: [row], connected: true }))).toBe('rows');
    expect(ghostState(sheet({ suggestions: [row], stale: true, refreshing: true }))).toBe('rows');
  });

  it('is a note when a finished sheet has nothing to say', () => {
    expect(ghostState(sheet())).toBe('note');
    expect(ghostState(sheet({ connected: true, computed_at: 'x' }))).toBe('note');
  });
});

describe('shouldRetry', () => {
  it('asks again only for a stale sheet with a refresh running', () => {
    expect(shouldRetry(sheet({ stale: true, refreshing: true }))).toBe(true);
    expect(shouldRetry(sheet({ stale: true }))).toBe(false);
    expect(shouldRetry(sheet({ refreshing: true }))).toBe(false);
    expect(shouldRetry(null)).toBe(false);
    expect(shouldRetry(undefined)).toBe(false);
    expect(SUGGESTIONS_STALE_RETRY_MS).toBeGreaterThan(1000);
  });

  it('gives up after the budget so a hung refresh is not polled forever', () => {
    const stale = sheet({ stale: true, refreshing: true });
    expect(shouldRetry(stale, SUGGESTIONS_MAX_RETRIES - 1)).toBe(true);
    expect(shouldRetry(stale, SUGGESTIONS_MAX_RETRIES)).toBe(false);
  });

  it('waits long enough for a GitHub read and one model call', () => {
    expect(SUGGESTIONS_MAX_RETRIES * SUGGESTIONS_STALE_RETRY_MS).toBeGreaterThanOrEqual(60_000);
  });
});

describe('the words', () => {
  it('names the source, the subject and the numbers on one line', () => {
    expect(factsLine(row)).toBe(
      'GitHub, yeaboi-ai/yeaboi-shop: 14 open issues, milestone 4.2 due 12 Sep',
    );
  });

  it('says what is being read while the skeleton shows', () => {
    expect(readingLine(sheet({ sources: ['GitHub', 'Jira', 'Notion'] }))).toBe(
      'Reading GitHub, Jira and Notion.',
    );
    expect(readingLine(sheet())).toBe('Reading your connections.');
    expect(readingLine(undefined)).toBe('Reading your connections.');
  });

  it('reads like the doors: sentences, no arrows, no all-caps', () => {
    for (const text of [CONNECT_LINE, OLDER_LINE]) {
      expect(text.endsWith('.')).toBe(true);
      expect(text).not.toMatch(/[→←·]/);
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
    }
    expect(SETTINGS_LABEL).toBe('Settings');
    expect(RETRY_LABEL).toBe('Retry');
    expect(CHECK_AGAIN_LABEL).toBe('Check again');
  });

  it('offers the rows in one line and a pair of labels that read as a toggle', () => {
    expect(SUGGEST_PROMPT).toBe('Not sure where to start?');
    expect(SUGGEST_LABEL).toBe('Suggest projects');
    expect(HIDE_SUGGESTIONS_LABEL).toBe('Hide suggestions');
    for (const text of [SUGGEST_LABEL, HIDE_SUGGESTIONS_LABEL]) {
      expect(text).not.toMatch(/[→←·.]/);
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });

  it('links to a settings page that exists', () => {
    const routes = JSON.parse(
      readFileSync(join(__dirname, '..', 'src/renderer/lib/yeaboi/routes.json'), 'utf8'),
    );
    const paths = new Set(
      (routes.pages ?? routes.routes ?? []).map((r: { path: string }) => r.path),
    );
    expect(paths.has(CONNECTIONS_ROUTE)).toBe(true);
    expect(paths.has(CREDENTIALS_ROUTE)).toBe(true);
  });
});

describe('emptyNote', () => {
  it('asks for an update on a sidecar without the route, with nothing to retry', () => {
    expect(emptyNote(null)).toEqual({ text: OLDER_LINE });
  });

  it('says the read failed, and offers Retry, when the request did not answer', () => {
    // A 500 or a restarted sidecar is not an old sidecar: telling the reader to
    // update a current yeaboi, with nothing to press, is the wrong dead end.
    expect(emptyNote(null, false, true)).toEqual({ text: FAILED_LINE, retry: RETRY_LABEL });
    expect(ghostState(undefined, false, true)).toBe('note');
  });

  it('says it is still reading, with Check again, once the budget is spent', () => {
    expect(emptyNote(sheet({ ...refreshingSheet, sources: ['GitHub', 'Jira'] }), true)).toEqual({
      text: 'Still reading GitHub and Jira. This can take a minute.',
      retry: CHECK_AGAIN_LABEL,
    });
    expect(emptyNote(refreshingSheet, true).text).toBe(
      'Still reading your connections. This can take a minute.',
    );
  });

  it('invites a connection when nothing can be read', () => {
    expect(emptyNote(sheet())).toEqual({
      text: CONNECT_LINE,
      link: { href: CONNECTIONS_ROUTE, label: SETTINGS_LABEL },
    });
  });

  it('names what could not be read and points at the credentials, with Retry', () => {
    const note = emptyNote(
      sheet({ connected: true, sources: [], warnings: ['GitHub could not be read'] }),
    );
    expect(note.text).toBe('GitHub could not be read. Check the credentials in Settings.');
    expect(note.link).toEqual({ href: CREDENTIALS_ROUTE, label: SETTINGS_LABEL });
    expect(note.retry).toBe(RETRY_LABEL);
  });

  it('keeps what was read quiet beside what failed', () => {
    const note = emptyNote(
      sheet({
        connected: true,
        sources: ['Jira', 'Notion'],
        warnings: ['GitHub could not be read'],
      }),
    );
    expect(note.text).toBe('Nothing open in Jira and Notion right now.');
    expect(note.detail).toBe('GitHub could not be read.');
    expect(note.link).toEqual({ href: CREDENTIALS_ROUTE, label: SETTINGS_LABEL });
    expect(note.retry).toBe(RETRY_LABEL);
  });

  it('says all is quiet when every source read fine and found nothing', () => {
    const note = emptyNote(sheet({ connected: true, sources: ['GitHub', 'Jira', 'Notion'] }));
    expect(note.text).toBe(
      'Nothing open in GitHub, Jira and Notion right now. Describe your first project above.',
    );
    expect(note.link).toBeUndefined();
    expect(note.retry).toBe(RETRY_LABEL);
    expect(emptyNote(sheet({ connected: true, sources: ['Jira'] })).text).toBe(
      'Nothing open in Jira right now. Describe your first project above.',
    );
  });
});

describe('the page', () => {
  const page = readFileSync(
    join(__dirname, '..', 'src/renderer/pages/projects/projects-page.tsx'),
    'utf8',
  );
  const unfolded = readFileSync(
    join(__dirname, '..', 'src/renderer/components/projects/suggested-projects.tsx'),
    'utf8',
  );

  it('keeps the rows folded behind one button, so nothing is read until asked', () => {
    expect(page).toContain('SUGGEST_LABEL');
    expect(page).toContain('HIDE_SUGGESTIONS_LABEL');
    expect(page).toContain('aria-expanded={open}');
    expect(page).toContain('{suggesting && (');
    expect(page).not.toContain('useProjectSuggestions');
    expect(page).not.toContain('FIRST_PROJECT_EXAMPLES');
  });

  it('reads the suggestions through the hook once unfolded, and shows them the ledger way', () => {
    expect(unfolded).toContain('useProjectSuggestions');
    expect(unfolded).toContain('ghostState(sheet, exhausted, failed)');
    expect(unfolded).toContain('emptyNote(');
    expect(unfolded).toContain('GhostSkeleton');
    expect(unfolded).toContain('NoteLine');
    expect(unfolded).toContain('LedgerHead');
  });

  it('has no fold and no floating footer any more', () => {
    expect(page).not.toContain('ContextFlow');
    expect(page).not.toContain('<footer');
    expect(page).toContain('LedgerHead');
    expect(page).toContain('OTHER_WAYS_WORD');
  });
});
