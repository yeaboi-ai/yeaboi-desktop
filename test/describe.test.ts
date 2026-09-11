// The promise the describe box makes: a first description is enough, yeaboi
// names the project from it, and the first conversation opens with it. Four
// screens say it, and the folding that makes it true happens here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESCRIBE_COPY,
  carriesDescription,
  composerNote,
  isFirstRun,
  openingLine,
} from '../src/renderer/lib/yeaboi/describe';

const RENDERER = join(import.meta.dirname, '..', 'src', 'renderer');
const read = (rel: string) => readFileSync(join(RENDERER, rel), 'utf8');

describe('composerNote', () => {
  it('explains the box before a word is typed', () => {
    expect(composerNote(false, false, '@ adds a link.')).toEqual({
      lead: DESCRIBE_COPY.RESTING_LEAD,
      tail: DESCRIBE_COPY.RESTING_TAIL,
    });
  });

  it('names what happens to the words once there are some', () => {
    expect(composerNote(true, false, '@ adds a link.')).toEqual({
      lead: DESCRIBE_COPY.NAMING_LEAD,
      tail: '@ adds a link.',
    });
  });

  it('drops the reference hint once something is attached', () => {
    expect(composerNote(true, true, '@ adds a link.').tail).toBe('');
  });

  it('always has a lead, so the slot never collapses', () => {
    for (const hasText of [false, true]) {
      for (const attached of [false, true]) {
        expect(composerNote(hasText, attached, '@ adds a link.').lead.length).toBeGreaterThan(0);
      }
    }
  });

  it('leads without a full stop — the serif runs on into the tail', () => {
    expect(DESCRIBE_COPY.RESTING_LEAD.endsWith('.')).toBe(false);
    expect(DESCRIBE_COPY.NAMING_LEAD.endsWith('.')).toBe(false);
  });
});

describe('openingLine', () => {
  it('folds the description into the starter as one sentence', () => {
    expect(openingLine("I'm planning a new feature that ", 'Users can export a report.')).toBe(
      "I'm planning a new feature that users can export a report",
    );
  });

  it('keeps the starter alone when there is no description', () => {
    expect(openingLine('I need to refactor ', null)).toBe('I need to refactor ');
    expect(openingLine('I need to refactor ', '   ')).toBe('I need to refactor ');
  });

  it('only lowercases the first letter, leaving names as written', () => {
    expect(openingLine('', 'Slack alerts for CI')).toBe('slack alerts for CI');
  });

  it('drops one trailing full stop, not an ellipsis mid-sentence', () => {
    expect(openingLine('', 'ship it. then rest.')).toBe('ship it. then rest');
  });
});

describe('carriesDescription', () => {
  const desc = 'Users can export a report.';

  it('sees the description inside what openingLine produced', () => {
    const idea = openingLine("I'm planning a new feature that ", desc);
    expect(carriesDescription(idea, desc)).toBe(true);
  });

  it('sees it when it was pasted verbatim, full stop and all', () => {
    expect(carriesDescription(desc, desc)).toBe(true);
  });

  it('is false once the reader has written their own thing', () => {
    expect(carriesDescription('Fix the flaky login test', desc)).toBe(false);
  });

  it('is false when the project has no description to carry', () => {
    expect(carriesDescription('anything at all', null)).toBe(false);
    expect(carriesDescription('anything at all', '  ')).toBe(false);
  });
});

describe('isFirstRun', () => {
  it('is true only while no session has happened', () => {
    expect(isFirstRun([])).toBe(true);
    expect(isFirstRun([{ id: 'a' }])).toBe(false);
  });
});

describe('the promise is said on every screen it passes through', () => {
  it('the composer reads its note from here rather than spelling one out', () => {
    const composer = read('components/projects/project-composer.tsx');
    expect(composer).toContain('composerNote(');
    expect(composer).not.toContain('yeaboi names it from this.');
  });

  it('the composer note renders whether or not there are words', () => {
    const composer = read('components/projects/project-composer.tsx');
    expect(composer).not.toContain('{(text || error || attached) && (');
    expect(composer).toContain('{note.lead}');
  });

  it("the note speaks in the sheet's two tones, like SheetWord one size down", () => {
    const composer = read('components/projects/project-composer.tsx');
    // The promise in the ledger's serif, the consequence in dimmer body type.
    expect(composer).toContain('font-display text-[15px] italic text-muted-foreground');
    expect(composer).toContain('text-[12px] font-body text-muted-foreground/70');
    const sheet = read('pages/projects/projects-page.tsx');
    expect(sheet).toContain('text-[12px] font-body text-muted-foreground/70');
  });

  it('the duck says a description is a start, not a commitment', () => {
    expect(read('lib/yeaboi/project-guide.ts')).toContain('not a commitment');
  });

  it('the first-run card offers the conversation the description opens', () => {
    const card = read('components/projects/first-run-card.tsx');
    expect(card).toContain('DESCRIBE_COPY.CARD_BODY');
    expect(card).toContain('/new');
  });

  it('the card heads and acts in different words', () => {
    // Heading and button both reading "Start the conversation" said it twice.
    expect(DESCRIBE_COPY.CARD_TITLE).not.toBe(DESCRIBE_COPY.CARD_ACTION);
  });

  it('withholds the offer on a borrowed project, as the rest of the page does', () => {
    const card = read('components/projects/first-run-card.tsx');
    expect(card).toContain('{canStart && (');
    const page = read('pages/projects/project-page.tsx');
    expect(page).toContain('canStart={project.is_own_team !== false}');
  });

  it('waits for the sessions fetch to settle before calling it a first run', () => {
    // An unread list is [] too, and a failed fetch must not hide the dashboard.
    const page = read('pages/projects/project-page.tsx');
    expect(page).toContain('const firstRun = sessionsRead && isFirstRun(sessions)');
    expect(page).toContain('setSessionsRead(true)');
  });

  it('the session idea box says where its words came from', () => {
    const page = read('pages/session/session-new-page.tsx');
    expect(page).toContain('DESCRIBE_COPY.CARRIED');
    expect(page).toContain('carriesDescription(idea, projectDesc)');
  });

  it('the session page folds the description through openingLine, not by hand', () => {
    const page = read('pages/session/session-new-page.tsx');
    expect(page).toContain('openingLine(');
    expect(page).not.toContain('.charAt(0).toLowerCase()');
  });
});
