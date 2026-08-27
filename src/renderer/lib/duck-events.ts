// App moments → duck words. One vocabulary for both ducks: the in-app bubble
// (DuckChrome reading duckVoice()) and the desktop pet (petNotify IPC) say
// the same thing. Pages never write the bubble directly — they name what
// happened and the table decides the words, so the tone stays consistent.
//
// A moment worth interrupting for also gets a NOTIFY row, and then the same
// name reaches you three more ways: a native banner (the only one that works
// with the window shut), an in-app toast, and a chime. Which of the four
// actually fire is the user's, in Settings → Duck.

import { toast } from '@/components/ui/toast';
import { playChime, windowFocused } from './chime';
import { NOTIFY, QUIPS } from './duck-vocabulary';
import { COACH_HOLD_MS, PRIORITY_COACH, duckVoice } from './duck-voice';
import { type PetPrefs, PET_DEFAULTS } from '@shared/pet-prefs';

// The prefs are read once and refreshed on save. The alternative — awaiting the
// bridge inside duckQuip — would make a speech bubble asynchronous.
let prefs: PetPrefs = PET_DEFAULTS;

export function setNotifyPrefs(next: PetPrefs): void {
  prefs = next;
}

/** What the user chose, for the one other place that raises a notice (the
 *  awareness feed, in AmbienceHost). */
export function notifyPrefs(): PetPrefs {
  return prefs;
}

/** The desktop runs a hash router, so a route is a fragment. */
function navigateTo(route: string): void {
  if (route) window.location.hash = route.startsWith('#') ? route : `#${route}`;
}

/** Say the line for an event key. Unknown keys say nothing — a missing quip
 *  is not worth a wrong one. `route` lets a click on the desktop duck, the
 *  banner or the toast bring the window to the thing that happened. */
export function duckQuip(key: string, options?: { sticky?: boolean; route?: string }): void {
  const line = QUIPS[key];
  if (!line) return;
  const sticky = options?.sticky ?? false;
  const route = options?.route ?? '';
  duckVoice().say(line);

  if (prefs.notify.bubble) {
    try {
      window.yeaboi.petNotify({ quip: line, sticky, route });
    } catch {
      /* bridge unavailable (e.g. plain browser) — the in-app bubble still spoke */
    }
  }

  const banner = NOTIFY[key];
  if (!banner) return;

  // A native banner is for reaching you elsewhere; in front of the window it is
  // redundant with the toast standing right there.
  if (prefs.notify.os && !windowFocused()) {
    try {
      window.yeaboi.notify({ title: banner.title, body: banner.body, route });
    } catch {
      /* no bridge — the toast below is the fallback */
    }
  }
  if (prefs.notify.toast) {
    toast.show({
      title: banner.title,
      description: banner.body,
      variant: key === 'run.failed' ? 'destructive' : 'success',
      ...(route ? { action: { label: 'Open', onClick: () => navigateTo(route) } } : {}),
    });
  }
  if (prefs.notify.chime) playChime();
}

/** A quieter tier for hints; in-app bubble only, never the desktop pet. */
export function duckCoach(text: string): void {
  duckVoice().say(text, PRIORITY_COACH, COACH_HOLD_MS);
}
