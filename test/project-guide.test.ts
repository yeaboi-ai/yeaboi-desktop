// The Projects header's duck: the three pages he says, true for each world,
// the stepping between them, and the guarantee that he stays in the header
// band above the sheet rather than floating over it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENTS_RELATED_LINE,
  AGENTS_RELATED_TITLE,
  GUIDE_SEEN_KEY,
  RELATED_CLAUSE,
  RELATED_TITLE,
  guidePages,
  relatedItems,
  relatedLine,
  stepIndex,
} from '../src/renderer/lib/yeaboi/project-guide';
import { FLOW, fallbackFlowKeys, flowFor } from '../src/renderer/lib/yeaboi/reads';

const RENDERER = join(import.meta.dirname, '..', 'src', 'renderer');
const read = (rel: string) => readFileSync(join(RENDERER, rel), 'utf8');

describe('guidePages', () => {
  it('is three pages, opening on what a project is and closing on how it grows', () => {
    const pages = guidePages(FLOW);
    expect(pages).toHaveLength(3);
    expect(pages[0]!.title).toBe('One piece of work');
    expect(pages[2]!.title).toBe('It grows as you go');
    for (const page of pages) {
      expect(page.title).not.toMatch(/\.$/);
      if (page.body) expect(page.body.endsWith('.')).toBe(true);
    }
  });

  it('lists every step of the Team flow, in flow order, under its label on the related page', () => {
    const page = guidePages(FLOW)[1]!;
    expect(page.title).toBe(RELATED_TITLE);
    expect(page.body).toBe('');
    expect(page.items!.map((item) => item.key)).toEqual(FLOW.map((step) => step.key));
    for (const item of page.items!) {
      expect(item.label).toBe(FLOW.find((step) => step.key === item.key)!.label);
      expect(item.clause).toBe(RELATED_CLAUSE[item.key]);
    }
  });

  it('leaves poker and retro out of the Solo page', () => {
    const solo = flowFor('solo', fallbackFlowKeys('solo'));
    const keys = relatedItems(solo).map((item) => item.key);
    expect(keys).toContain('daily-standup');
    expect(keys).not.toContain('poker');
    expect(keys).not.toContain('retro');
  });

  it('says a project with no flow at all scopes by repository', () => {
    const page = guidePages([])[1]!;
    expect(page.title).toBe(AGENTS_RELATED_TITLE);
    expect(page.body).toBe(AGENTS_RELATED_LINE);
    expect(page.items).toBeUndefined();
  });
});

describe('relatedLine', () => {
  it('reads the related page as one sentence', () => {
    expect(relatedLine(FLOW)).toBe(
      'Everything inside stays related: plan frames every other run, analysis profiles the team, standup tracks its blockers, poker sizes its tickets, retro carries actions over and report reads all of it.',
    );
    expect(relatedLine(FLOW.filter((s) => s.key === 'daily-standup'))).toBe(
      'Everything inside stays related: standup tracks its blockers.',
    );
    expect(relatedLine([])).toBe(AGENTS_RELATED_LINE);
  });
});

describe('stepIndex', () => {
  it('holds at both ends rather than wrapping', () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(5, 0, 3)).toBe(2);
    expect(stepIndex(1, 0, 0)).toBe(0);
  });
});

describe('the guide on the page', () => {
  it('remembers being read under one key', () => {
    expect(GUIDE_SEEN_KEY).toBe('projects-guide-seen');
    expect(read('components/projects/project-guide.tsx')).toContain('GUIDE_SEEN_KEY');
  });

  it('stands in the header band, so the sheet can grow beneath him and never meet him', () => {
    const page = read('pages/projects/projects-page.tsx');
    const header = page.slice(page.indexOf('<header'), page.indexOf('</header>'));
    expect(header).toContain('<ProjectGuide');
    expect(header).toContain('flex-wrap');
  });

  it('is in flow: nothing about him is fixed to the window or absolute to the page', () => {
    const src = read('components/projects/project-guide.tsx');
    expect(src).not.toMatch(/\bfixed\b/);
    // The tail is the one absolute element, and it sits inside the bubble.
    expect(src.match(/\babsolute\b/g)).toHaveLength(1);
  });

  it('floats on a keyframe the OS can switch off', () => {
    const css = read('styles/globals.css');
    expect(css).toContain('@keyframes guide-float');
    const reduced = css.slice(css.indexOf('[data-guide-float]'));
    expect(reduced).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\[data-guide-float\]\s*\{\s*animation: none/,
    );
  });
});
