// The room's drawers and keys: six drawers in order, plain names, unique
// keys, a key opening its drawer, Escape closing.

import { describe, expect, it } from 'vitest';
import {
  DRAWERS,
  SOCKET_DRAWERS,
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
  });

  it('reads the vendored socket only from the drawers that show a call', () => {
    expect([...SOCKET_DRAWERS].sort()).toEqual(['recap', 'video']);
  });

  it('claims each hotkey once', () => {
    const keys = DRAWERS.map((d) => d.hotkey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('roomKey', () => {
  it('opens each drawer by its key', () => {
    expect(roomKey('i', false)).toEqual({ type: 'open', kind: 'blueprint' });
    expect(roomKey('v', false)).toEqual({ type: 'open', kind: 'video' });
    expect(roomKey('r', false)).toEqual({ type: 'open', kind: 'recap' });
    expect(roomKey('s', false)).toEqual({ type: 'open', kind: 'settings' });
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
