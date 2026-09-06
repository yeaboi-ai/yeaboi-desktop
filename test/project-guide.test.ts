// The Projects header's duck: the three lines he says, true for each world,
// the stepping between them, and the guarantee that he stays in the header
// band above the sheet rather than floating over it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENTS_RELATED_LINE,
  FIRST_LINE,
  GUIDE_SEEN_KEY,
  LAST_LINE,
  RELATED_CLAUSE,
  guideLines,
  relatedLine,
  stepIndex,
} from '../src/renderer/lib/yeaboi/project-guide';
import { FLOW, fallbackFlowKeys, flowFor } from '../src/renderer/lib/yeaboi/reads';

const RENDERER = join(import.meta.dirname, '..', 'src', 'renderer');
const read = (rel: string) => readFileSync(join(RENDERER, rel), 'utf8');

describe('guideLines', () => {
  it('is three sentences, opening on what a project is and closing on how it grows', () => {
    const lines = guideLines(FLOW);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(FIRST_LINE);
    expect(lines[2]).toBe(LAST_LINE);
    for (const line of lines) expect(line.endsWith('.')).toBe(true);
  });

  it('names every step of the Team flow in flow order in the middle line', () => {
    const line = relatedLine(FLOW);
    expect(line.startsWith('Everything inside stays related: ')).toBe(true);
    let at = -1;
    for (const step of FLOW) {
      const clause = RELATED_CLAUSE[step.key];
      expect(clause, `${step.key} has no clause`).toBeTruthy();
      const found = line.indexOf(clause!);
      expect(found, `${step.key} missing`).toBeGreaterThan(at);
      at = found;
    }
    expect(line).toContain(' and reports read all of it.');
  });

  it('leaves poker and retro out of the Solo line', () => {
    const solo = flowFor('solo', fallbackFlowKeys('solo'));
    const line = relatedLine(solo);
    expect(line).toContain('standups track its blockers');
    expect(line).not.toContain('poker');
    expect(line).not.toContain('retro');
  });

  it('says the Agents world scopes by repository, which has no flow', () => {
    expect(relatedLine([])).toBe(AGENTS_RELATED_LINE);
    expect(guideLines(flowFor('agents', fallbackFlowKeys('team')))[1]).toBe(AGENTS_RELATED_LINE);
  });

  it('reads as one clause when only one step is in the flow', () => {
    expect(relatedLine(FLOW.filter((s) => s.key === 'daily-standup'))).toBe(
      'Everything inside stays related: standups track its blockers.',
    );
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
