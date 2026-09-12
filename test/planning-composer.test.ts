// The New plan composer's words and its hand-off to the room: what the line
// under the field says, what a failed start says, and the screenshots kept
// aside for the opening turn.

import { describe, expect, it } from 'vitest';
import {
  withReferences,
  COMPOSER_COPY,
  composerNote,
  createErrorMessage,
  openingWithChips,
  stashOpening,
  takeOpening,
} from '../src/renderer/lib/planning/composer';

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('composerNote', () => {
  it('rests on what a description is for, then says what the words become', () => {
    expect(composerNote(false, false, 'hint')).toEqual({
      lead: COMPOSER_COPY.RESTING_LEAD,
      tail: COMPOSER_COPY.RESTING_TAIL,
    });
    expect(composerNote(true, false, 'hint')).toEqual({
      lead: COMPOSER_COPY.NAMING_LEAD,
      tail: 'hint',
    });
    expect(composerNote(true, true, 'hint').tail).toBe('');
  });

  it('reads as sentences, not eyebrows or arrows', () => {
    for (const line of Object.values(COMPOSER_COPY)) {
      expect(line).not.toMatch(/[·→]/);
      expect(line).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('createErrorMessage', () => {
  it('names a network failure, keeps a message, and has a last resort', () => {
    expect(createErrorMessage(new TypeError('fetch'))).toMatch(/Network/);
    expect(createErrorMessage(new Error('the sidecar said no'))).toBe('the sidecar said no');
    expect(createErrorMessage(42)).toMatch(/Couldn't start the plan/);
  });
});

describe('the opening stash', () => {
  it('keeps screenshots for a plan and gives them back once', () => {
    const store = memory();
    stashOpening('p1', { paths: ['/a.png'], chips: ['[image #1]'] }, store);
    expect(takeOpening('p1', store)).toEqual({ paths: ['/a.png'], chips: ['[image #1]'] });
    expect(takeOpening('p1', store)).toBeNull();
  });

  it('keeps nothing for a plan with no screenshots, and survives junk', () => {
    const store = memory();
    stashOpening('p2', { paths: [], chips: [] }, store);
    expect(takeOpening('p2', store)).toBeNull();
    store.setItem('planning.opening.p3', '{not json');
    expect(takeOpening('p3', store)).toBeNull();
    expect(takeOpening('p4', null)).toBeNull();
  });

  it('appends the chips to the opening turn so the engine keeps the images', () => {
    expect(openingWithChips('Build a pond ', { paths: ['/a'], chips: ['[image #1]'] })).toBe(
      'Build a pond [image #1]',
    );
    expect(openingWithChips('Build a pond', null)).toBe('Build a pond');
  });
});

describe('withReferences', () => {
  it('writes the chosen references under the description, one line each', () => {
    const text = withReferences('Build a booking site', [
      { label: 'PROJ-12 Login', subject: 'PROJ-12', url: 'https://jira/PROJ-12' },
      { label: 'owner/repo', subject: 'owner/repo', url: null },
      { label: '', subject: 'a page id' },
    ]);
    expect(text).toBe(
      'Build a booking site\n\nReferences:\n- PROJ-12 Login — https://jira/PROJ-12\n- owner/repo\n- a page id',
    );
  });

  it('leaves a description alone when there are none', () => {
    expect(withReferences('Just words', [])).toBe('Just words');
  });
});
