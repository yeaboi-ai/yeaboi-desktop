// The Projects ledger's pure half: the shared row grid, the head row's
// sentences, the serif words, the rows-and-Completed split, and the
// composer's error sentences.

import { describe, expect, it } from 'vitest';
import {
  ALL_DONE_LINE,
  COMPLETED_WORD,
  DELETE_LABEL,
  DELETE_PROJECT_MESSAGE,
  DELETE_PROJECT_TITLE,
  IN_PROGRESS_WORD,
  LEDGER_ROW,
  NOT_ALLOWED_LINE,
  NOT_ALLOWED_TITLE,
  OTHER_WAYS_WORD,
  RENAME_LABEL,
  START_FROM_LABEL,
  UNREACHABLE_LINE,
  createErrorMessage,
  leavesSentence,
  ledgerColumns,
  ledgerSections,
  projectCount,
  rowActions,
} from '../src/renderer/lib/yeaboi/ledger';
import { FLOW } from '../src/renderer/lib/yeaboi/reads';

describe('ledgerColumns', () => {
  it('gives one 3.5rem column per step between the name and the date', () => {
    expect(ledgerColumns(6)).toBe('minmax(0, 1fr) repeat(6, 3.5rem) 5.5rem');
    expect(ledgerColumns(4)).toBe('minmax(0, 1fr) repeat(4, 3.5rem) 5.5rem');
  });

  it('is name and date alone when the world has no flow', () => {
    expect(ledgerColumns(0)).toBe('minmax(0, 1fr) 5.5rem');
    expect(ledgerColumns(-1)).toBe('minmax(0, 1fr) 5.5rem');
  });

  it('is the grid every row reads', () => {
    expect(LEDGER_ROW).toContain('[grid-template-columns:var(--ledger-cols)]');
  });
});

describe('leavesSentence', () => {
  it('names the step and what it leaves, as one sentence, for every step of the flow', () => {
    for (const step of FLOW) {
      const sentence = leavesSentence(step);
      expect(sentence.startsWith(`${step.label} leaves `)).toBe(true);
      expect(sentence.endsWith('.')).toBe(true);
      expect(sentence).not.toMatch(/\.\.$/);
    }
    expect(leavesSentence(FLOW[0]!)).toBe(
      'Plan leaves the sprint plan every other run frames itself with.',
    );
  });
});

describe('ledgerSections', () => {
  const row = (id: string, created_at: string, status?: string) => ({ id, created_at, status });

  it('puts active rows first and done ones under Completed, newest first', () => {
    const { rows, completed } = ledgerSections([
      row('a', '2026-09-01T00:00:00Z'),
      row('b', '2026-09-03T00:00:00Z', 'done'),
      row('c', '2026-09-02T00:00:00Z', 'active'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(completed.map((r) => r.id)).toEqual(['b']);
  });

  it('is two empty lists for no projects', () => {
    expect(ledgerSections([])).toEqual({ rows: [], completed: [] });
  });
});

describe('the words on the sheet', () => {
  it('keeps the labels in sentence case with no arrows', () => {
    for (const text of [
      IN_PROGRESS_WORD,
      COMPLETED_WORD,
      OTHER_WAYS_WORD,
      START_FROM_LABEL,
      ALL_DONE_LINE,
      RENAME_LABEL,
      DELETE_LABEL,
      DELETE_PROJECT_TITLE,
      DELETE_PROJECT_MESSAGE,
      NOT_ALLOWED_TITLE,
      NOT_ALLOWED_LINE,
      UNREACHABLE_LINE,
      projectCount(1),
      projectCount(3),
    ]) {
      expect(text).not.toMatch(/[→←·]/);
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('createErrorMessage', () => {
  it('words a rejected fetch for a person', () => {
    expect(createErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Network error. Please check your connection.',
    );
  });

  it('passes the backend detail through', () => {
    expect(createErrorMessage(new Error('Name already taken.'))).toBe('Name already taken.');
  });

  it('falls back to one sentence for anything else', () => {
    expect(createErrorMessage(undefined)).toBe("Couldn't create the project. Please try again.");
    expect(createErrorMessage(new Error(''))).toBe(
      "Couldn't create the project. Please try again.",
    );
  });
});

describe('the rows’ actions', () => {
  it('are rename, the status move and delete, in that order', () => {
    expect(rowActions(undefined).map((a) => [a.key, a.label])).toEqual([
      ['rename', 'Rename'],
      ['status', 'Mark done'],
      ['delete', 'Delete'],
    ]);
    expect(rowActions('done').map((a) => a.label)).toEqual(['Rename', 'Reopen', 'Delete']);
  });

  it('count the projects in progress in words', () => {
    expect(projectCount(1)).toBe('One project');
    expect(projectCount(3)).toBe('3 projects');
  });
});
