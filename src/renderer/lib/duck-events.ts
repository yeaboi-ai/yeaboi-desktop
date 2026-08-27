// App moments → duck words. One vocabulary for both ducks: the in-app bubble
// (DuckChrome reading duckVoice()) and the desktop pet (petNotify IPC) say
// the same thing. Pages never write the bubble directly — they name what
// happened and the table decides the words, so the tone stays consistent.

import { COACH_HOLD_MS, PRIORITY_COACH, duckVoice } from './duck-voice';

const QUIPS: Record<string, string> = {
  // Planning session
  'session.started': "Let's plan!",
  'session.joined': 'Company!',
  'session.reconnected': 'Back online!',
  'session.disconnected': 'Lost the thread…',
  'session.ready-to-finalize': "Blueprint's looking solid!",
  'session.wrapped': "That's a wrap!",
  'blueprint.suggestion': 'Got an idea for the blueprint.',
  'blueprint.section-completed': 'Section done!',
  'wizard.committed': 'Stories on the board!',
  'wizard.generating': 'Drafting the stories…',
  // Niko
  'niko.reply': "Niko's got you.",
  // Board
  'board.card-created': 'New card!',
};

/** Say the line for an event key. Unknown keys say nothing — a missing quip
 *  is not worth a wrong one. `route` lets a click on the desktop duck bring
 *  the main window to the thing that happened. */
export function duckQuip(key: string, options?: { sticky?: boolean; route?: string }): void {
  const line = QUIPS[key];
  if (!line) return;
  duckVoice().say(line);
  try {
    window.yeaboi.petNotify({
      quip: line,
      sticky: options?.sticky ?? false,
      route: options?.route ?? '',
    });
  } catch {
    /* bridge unavailable (e.g. plain browser) — the in-app bubble still spoke */
  }
}

/** A quieter tier for hints; in-app bubble only, never the desktop pet. */
export function duckCoach(text: string): void {
  duckVoice().say(text, PRIORITY_COACH, COACH_HOLD_MS);
}
