// The OS path picker: what the renderer asks for, and what Electron is told.
//
// The load-bearing case is the absence of a combined file+folder kind. macOS
// honours openFile and openDirectory together; Windows and Linux silently
// honour one, so a dialog that "asks for either" is a picker that does the
// wrong thing on two platforms out of three.

import { describe, expect, it } from 'vitest';
import { clampPickOptions, pickProperties } from '../src/shared/pick-paths';

describe('pickProperties', () => {
  it('a folder pick can create a folder', () => {
    expect(pickProperties('folder', false)).toEqual(['openDirectory', 'createDirectory']);
  });

  it('a file pick opens files only', () => {
    expect(pickProperties('file', false)).toEqual(['openFile']);
  });

  it('multi-select is additive on either kind', () => {
    expect(pickProperties('folder', true)).toContain('multiSelections');
    expect(pickProperties('file', true)).toEqual(['openFile', 'multiSelections']);
  });

  it('never asks for files and folders in one dialog', () => {
    for (const kind of ['file', 'folder'] as const) {
      const props = pickProperties(kind, true);
      expect(props.includes('openFile') && props.includes('openDirectory')).toBe(false);
    }
  });
});

describe('clampPickOptions', () => {
  it('defaults to a single folder', () => {
    expect(clampPickOptions(undefined)).toEqual({
      title: undefined,
      defaultPath: undefined,
      kind: 'folder',
      multi: false,
      filters: [],
    });
  });

  it('keeps what it recognises', () => {
    const picked = clampPickOptions({ kind: 'file', multi: true, title: 'Allow files' });
    expect(picked.kind).toBe('file');
    expect(picked.multi).toBe(true);
    expect(picked.title).toBe('Allow files');
  });

  it('an unknown kind falls back to folder rather than reaching Electron', () => {
    expect(clampPickOptions({ kind: 'anything' }).kind).toBe('folder');
    expect(clampPickOptions({ kind: 42 }).kind).toBe('folder');
  });

  it('a non-boolean multi is not multi', () => {
    expect(clampPickOptions({ multi: 'yes' }).multi).toBe(false);
  });

  it('drops junk out of the title and filters', () => {
    const picked = clampPickOptions({
      title: 7,
      filters: ['nope', { name: 'JSON', extensions: ['json', 3] }],
    });
    expect(picked.title).toBeUndefined();
    expect(picked.filters).toEqual([{ name: 'JSON', extensions: ['json'] }]);
  });

  it('caps how many filters a renderer can send', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `f${i}`, extensions: ['x'] }));
    expect(clampPickOptions({ filters: many }).filters.length).toBeLessThanOrEqual(8);
  });
});
