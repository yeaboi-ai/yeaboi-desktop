// The duck's visibility, as a pure decision table. The pet window is
// always-on-top at 'screen-saver' level, so with the app focused the duck
// would walk across the very window being worked in — suppression hides him
// while any app window holds focus, without touching the stored preference.
//
// Two invariants: window *existence* tracks `enabled` (disabling still
// destroys, as ever), and window *visibility* tracks `enabled && !suppressed`.

export interface PetVisibility {
  /** The user's stored preference — the tray checkbox and settings switch. */
  enabled: boolean;
  /** Transient: an app window is focused. Never persisted. */
  suppressed: boolean;
}

export type PetWindowCommand =
  'destroy' | 'create-hidden' | 'create-visible' | 'hide' | 'show' | 'none';

export function petWindowCommand(
  state: PetVisibility,
  window: { exists: boolean; visible: boolean },
): PetWindowCommand {
  if (!state.enabled) return window.exists ? 'destroy' : 'none';
  if (!window.exists) return state.suppressed ? 'create-hidden' : 'create-visible';
  if (state.suppressed) return window.visible ? 'hide' : 'none';
  return window.visible ? 'none' : 'show';
}

/** Whether the cursor feed and dock poll should run — both are wasted work
 *  against a hidden window. */
export function petFeedsActive(state: PetVisibility, windowExists: boolean): boolean {
  return state.enabled && !state.suppressed && windowExists;
}
