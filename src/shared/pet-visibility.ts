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
  /**
   * Transient: the duck has just been let out and is showing where he lives.
   *
   * It outranks suppression, and only suppression. Accepting the offer is a
   * click inside the app, so the app is focused, so without this the duck the
   * user just asked to meet would be hidden the instant he arrived.
   */
  introducing?: boolean;
}

export type PetWindowCommand =
  'destroy' | 'create-hidden' | 'create-visible' | 'hide' | 'show' | 'none';

export function petWindowCommand(
  state: PetVisibility,
  window: { exists: boolean; visible: boolean },
): PetWindowCommand {
  if (!state.enabled) return window.exists ? 'destroy' : 'none';
  const hidden = state.suppressed && !state.introducing;
  if (!window.exists) return hidden ? 'create-hidden' : 'create-visible';
  if (hidden) return window.visible ? 'hide' : 'none';
  return window.visible ? 'none' : 'show';
}

/** Whether the cursor feed and dock poll should run — both are wasted work
 *  against a hidden window. */
export function petFeedsActive(state: PetVisibility, windowExists: boolean): boolean {
  return state.enabled && !(state.suppressed && !state.introducing) && windowExists;
}
