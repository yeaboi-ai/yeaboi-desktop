// The duck's visibility decision table. Suppression (an app window is
// focused) must hide without destroying, and must never leak into the stored
// preference — these tests pin the full enabled × suppressed × window grid.

import { describe, expect, it } from 'vitest';
import {
  petFeedsActive,
  petWindowCommand,
  type PetVisibility,
  type PetWindowCommand,
} from '../src/shared/pet-visibility';

type Window = { exists: boolean; visible: boolean };

const grid: Array<[PetVisibility, Window, PetWindowCommand]> = [
  // Disabled: the window must not exist, whatever suppression says.
  [{ enabled: false, suppressed: false }, { exists: true, visible: true }, 'destroy'],
  [{ enabled: false, suppressed: true }, { exists: true, visible: false }, 'destroy'],
  [{ enabled: false, suppressed: false }, { exists: false, visible: false }, 'none'],
  [{ enabled: false, suppressed: true }, { exists: false, visible: false }, 'none'],
  // Enabled, no window yet: hatch — hidden if the app is focused right now.
  [{ enabled: true, suppressed: false }, { exists: false, visible: false }, 'create-visible'],
  [{ enabled: true, suppressed: true }, { exists: false, visible: false }, 'create-hidden'],
  // Enabled, window live: visibility tracks suppression.
  [{ enabled: true, suppressed: true }, { exists: true, visible: true }, 'hide'],
  [{ enabled: true, suppressed: true }, { exists: true, visible: false }, 'none'],
  [{ enabled: true, suppressed: false }, { exists: true, visible: false }, 'show'],
  [{ enabled: true, suppressed: false }, { exists: true, visible: true }, 'none'],
];

describe('petWindowCommand', () => {
  it.each(grid)('%o with window %o → %s', (state, window, command) => {
    expect(petWindowCommand(state, window)).toBe(command);
  });

  it('is idempotent: applying a command settles to none', () => {
    const apply = (window: Window, command: PetWindowCommand): Window => {
      switch (command) {
        case 'destroy':
          return { exists: false, visible: false };
        case 'create-hidden':
          return { exists: true, visible: false };
        case 'create-visible':
          return { exists: true, visible: true };
        case 'hide':
          return { ...window, visible: false };
        case 'show':
          return { ...window, visible: true };
        case 'none':
          return window;
      }
    };
    for (const [state, window] of grid) {
      const settled = apply(window, petWindowCommand(state, window));
      expect(petWindowCommand(state, settled)).toBe('none');
    }
  });
});

describe('petFeedsActive', () => {
  it('runs the feeds only for an enabled, unsuppressed, live window', () => {
    expect(petFeedsActive({ enabled: true, suppressed: false }, true)).toBe(true);
  });

  it('stops them when hidden, disabled, or windowless', () => {
    // A 60fps cursor feed against a hidden window is pure waste.
    expect(petFeedsActive({ enabled: true, suppressed: true }, true)).toBe(false);
    expect(petFeedsActive({ enabled: false, suppressed: false }, true)).toBe(false);
    expect(petFeedsActive({ enabled: true, suppressed: false }, false)).toBe(false);
  });
});
