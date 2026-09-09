// Reaching into the screensaver: which events dismiss it, and which one does
// not.
//
// The saver's promise is that it leaves the instant somebody is there, and
// every event in the host's ACTIVITY list means somebody is there. That leaves
// no way to click a story on the news screensaver: the click both misses the
// paper and takes the paper away.
//
// The exemption is exactly one key. While a DOM scene is showing — "reachable"
// — holding the platform modifier opens a reach: the paper becomes hittable
// and pointer events stop dismissing. Nothing else changes, and on a canvas
// scene nothing changes at all, because there is nothing there to click.
//
// A held key is the only gesture worth exempting, because it cancels itself:
// the reach ends the moment the person stops asserting it. Deliberately
// pointer-only — "any key dismisses" is a contract worth keeping trivially
// simple.
//
// Pure, and typed structurally rather than against DOM constructors, because
// the suite runs under node with no DOM.

/** The events the host treats as a person being at the window. */
const WAKING = new Set(['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus']);

export interface ReachInput {
  /** The event's type. Only the ones the host binds ever reach here. */
  type: string;
  /** ``event.key``, for key events. */
  key?: string | undefined;
  /** ``metaKey || ctrlKey`` as the event carries it; false where it has neither. */
  mod: boolean;
}

export interface ReachState {
  /** A DOM scene is showing. False for every canvas scene and whenever the
   *  saver is down — and then this module is the plain old contract. */
  reachable: boolean;
  reaching: boolean;
}

export interface ReachOutcome {
  /** Whether the reach is held after this event. */
  reaching: boolean;
  /** Whether this event dismisses the saver. */
  wakes: boolean;
}

/** Meta and Control both, on every platform.
 *
 *  The reach follows ``metaKey || ctrlKey``, so accepting both key names keeps
 *  the two in step without threading the platform into a handler that runs on
 *  every pointer move. */
export function isModifierKey(key: string | undefined): boolean {
  return key === 'Meta' || key === 'Control';
}

/** Read a DOM event without touching a DOM constructor. */
export function reachInput(event: Event): ReachInput {
  const e = event as Event & { key?: string; metaKey?: boolean; ctrlKey?: boolean };
  return {
    type: event.type,
    key: typeof e.key === 'string' ? e.key : undefined,
    mod: Boolean(e.metaKey || e.ctrlKey),
  };
}

/** How one event moves the reach, and whether it dismisses the saver. */
export function reachStep(input: ReachInput, state: ReachState): ReachOutcome {
  // Not a DOM scene, or nothing showing: everything wakes it, as it always has.
  if (!state.reachable) return { reaching: false, wakes: WAKING.has(input.type) };

  switch (input.type) {
    case 'keydown':
      // The bare modifier is the only key that does not dismiss, and only
      // here. Every other key is a person unambiguously at the window.
      return isModifierKey(input.key)
        ? { reaching: true, wakes: false }
        : { reaching: false, wakes: true };

    case 'keyup':
      // Releasing returns to passive without dismissing. The next movement
      // dismisses, which is the ordinary contract back again.
      return { reaching: state.reaching && input.mod, wakes: false };

    case 'pointermove':
    case 'pointerdown': {
      // The flag on the event, not the remembered one: a keyup lost to an app
      // switch cannot hold the reach open past the next movement.
      const reaching = state.reaching && input.mod;
      return { reaching, wakes: !reaching };
    }

    case 'focus':
      // Clicking a story focuses its anchor, and this listener is bound
      // capture-phase on the window, so that inner focus must not dismiss the
      // saver out from under the click. Focus arriving from outside the app is
      // always preceded by a blur, which has already ended the reach.
      return { reaching: state.reaching, wakes: !state.reaching };

    default:
      // wheel. Nothing on the paper scrolls, so this is only ever a person.
      return { reaching: false, wakes: WAKING.has(input.type) };
  }
}

export interface ReachHint {
  /** The keycap to draw, or null once the key is being held. */
  key: string | null;
  text: string;
}

/** The hint chip's copy. ``modKey`` comes from ``modKeyName(platform())``. */
export function reachHint(modKey: string, reaching: boolean): ReachHint {
  return reaching
    ? { key: null, text: 'Click a story to open it' }
    : { key: modKey, text: 'hold to click a story' };
}
