// The room's drawers and keys: six drawers in order, plain names, unique
// keys, a key that opens only a drawer that exists yet, Escape closing.

import { describe, expect, it } from 'vitest';
import {
  DRAWERS,
  NOT_READY_LINE,
  roomKey,
  toggleDrawer,
} from '../src/renderer/lib/planning/drawers';

describe('DRAWERS', () => {
  it('lists the six in the strip order with plain names', () => {
    expect(DRAWERS.map((d) => d.kind)).toEqual([
      'blueprint',
      'context',
      'integrations',
      'video',
      'recap',
      'settings',
    ]);
    for (const drawer of DRAWERS) {
      expect(drawer.label).not.toMatch(/[·→]/);
      expect(drawer.label).not.toMatch(/\b[A-Z]{2,}\b/);
    }
    expect(NOT_READY_LINE).toMatch(/\.$/);
  });

  it('claims each hotkey once', () => {
    const keys = DRAWERS.map((d) => d.hotkey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('roomKey', () => {
  it('opens a ready drawer by its key, never one that is not ready', () => {
    expect(roomKey('i', false)).toEqual({ type: 'open', kind: 'blueprint' });
    expect(roomKey('v', false)).toBeNull();
  });

  it('closes on Escape even while typing, and ignores letters while typing', () => {
    expect(roomKey('Escape', true)).toEqual({ type: 'close' });
    expect(roomKey('i', true)).toBeNull();
    expect(roomKey('?', false)).toEqual({ type: 'shortcuts' });
    expect(roomKey('?', true)).toBeNull();
    expect(roomKey('x', false)).toBeNull();
  });
});

describe('toggleDrawer', () => {
  it('opens one, closes the same one, swaps to another', () => {
    expect(toggleDrawer(null, 'blueprint')).toBe('blueprint');
    expect(toggleDrawer('blueprint', 'blueprint')).toBeNull();
    expect(toggleDrawer('blueprint', 'context')).toBe('context');
  });
});
