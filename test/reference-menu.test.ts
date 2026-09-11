// The composer and the menu: what the sources pin so a refactor cannot
// quietly drop a trigger, a chip row, or put the menu on the window instead
// of under the field.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', 'src/renderer', path), 'utf8');

describe('the composer', () => {
  const src = read('components/planning/plan-composer.tsx');

  it('opens the menu on a trigger, takes a pasted or dropped image, and shows the chips', () => {
    expect(src).toContain('triggerAt(');
    expect(src).toContain('<ReferenceMenu');
    expect(src).toContain('<ReferenceChips');
    expect(src).toContain('onPaste=');
    expect(src).toContain('onDrop=');
    expect(src).toContain('screenshotVerdict(');
    expect(src).toContain('loadConnections(true)');
  });

  it('hands Create the words, the references and the files together', () => {
    expect(src).toMatch(/onCreate\(\{\s*description: text,\s*references,\s*files:/);
  });

  it('keeps everything in flow under the field', () => {
    expect(src).not.toMatch(/\bfixed\b/);
  });
});

describe('the menu', () => {
  const src = read('components/planning/reference-menu.tsx');

  it('is a list of options driven by the field on its first level', () => {
    expect(src).toContain('role="option"');
    expect(src).toContain('useDismissOnOutside(');
    expect(src).toContain('moveSelection(');
    expect(src).toContain('useImperativeHandle(');
  });

  it('asks the sidecar a beat after the last keystroke and drops stale answers', () => {
    expect(src).toContain('loadReferenceItems(');
    expect(src).toContain('sequence.current');
    expect(src).toContain('SEARCH_DEBOUNCE_MS');
  });

  it('sits under the field, never on the window', () => {
    expect(src).toContain('absolute top-full');
    expect(src).not.toMatch(/\bfixed\b/);
  });
});
