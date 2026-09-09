// The picker's surface, pinned at the source: one IPC channel, and no free
// typing left in the editors a picker now serves.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const preload = read('src', 'preload', 'index.ts');
const main = read('src', 'main', 'index.ts');
const allowedPaths = read('src', 'renderer', 'components', 'settings', 'allowed-paths-row.tsx');
const editableList = read(
  'src',
  'renderer',
  'components',
  'settings',
  'primitives',
  'editable-list.tsx',
);

describe('one channel serves every pick', () => {
  it('the preload exposes pickPaths', () => {
    expect(preload).toContain('pickPaths');
    expect(preload).toContain("ipcRenderer.invoke('dialog:pick-paths'");
  });

  it('pickDirectory survives as a shorthand over the same channel', () => {
    expect(preload).toContain('pickDirectory');
    expect(preload).toMatch(/pickDirectory:[\s\S]{0,240}dialog:pick-paths/);
  });

  it('the old directory-only channel is gone from both sides', () => {
    expect(preload).not.toContain('dialog:pick-directory');
    expect(main).not.toContain('dialog:pick-directory');
  });

  it('the main process clamps what crossed the boundary before Electron sees it', () => {
    expect(main).toContain('clampPickOptions');
    expect(main).toContain('pickProperties');
  });
});

describe('allowed paths is picked, never typed', () => {
  it('the editor has no text input of its own', () => {
    expect(allowedPaths).not.toContain('<input');
  });

  it('it offers files and folders as two buttons', () => {
    expect(allowedPaths).toContain('Add folder…');
    expect(allowedPaths).toContain('Add file…');
    expect(allowedPaths).toMatch(/kind: 'file'/);
    expect(allowedPaths).toMatch(/kind: 'folder'/);
  });

  it('adding is multi-select — one drag can grant several', () => {
    expect(allowedPaths).toContain('multi: true');
  });

  it('shows what is saved as one entry per line, not a joined string', () => {
    // Three paths joined by commas wrap into a paragraph nobody can read an
    // entry out of, and each entry is a read-and-write grant worth counting.
    expect(allowedPaths).toContain('field.items ?? splitCsv(field.value)');
    expect(allowedPaths).toContain('<ul');
    expect(allowedPaths).toContain('<li');
  });

  it('saving stays explicit: granting read and write is not a side effect of picking', () => {
    expect(allowedPaths).toContain('saveAllowedPaths');
    expect(allowedPaths).toMatch(/>\s*Save\s*</);
    expect(allowedPaths).toMatch(/>\s*Cancel\s*</);
  });
});

describe('the shared list editor', () => {
  it('carries no text input, so typing always comes from a dialog the call site opens', () => {
    expect(editableList).not.toContain('<input');
  });

  it('every row can be removed and edited by button', () => {
    expect(editableList).toContain('aria-label={`Remove ${item.label}`}');
    expect(editableList).toContain('aria-label={`Edit ${item.label}`}');
  });
});
