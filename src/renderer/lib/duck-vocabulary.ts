// What the duck says, and what is worth interrupting you for.
//
// Data only — no imports — so the vocabulary can be checked against the tables
// that use it (run-notices.ts, the main process's clamps) without dragging the
// whole renderer in. duck-events.ts is what turns a key here into words.

export const QUIPS: Record<string, string> = {
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
  // Runs that finish while you were doing something else
  'run.analysis': 'Analysis complete!',
  'run.standup': 'Standup ready!',
  'run.reporting': 'Report ready!',
  'run.roadmap': 'Roadmap intake done!',
  'run.agents': 'Agent report ready!',
  'run.ceremony': 'Ceremony finished!',
  'run.failed': 'That run went wrong.',
};

/** The moments worth a banner, a toast and a chime as well as a quip. A key
 *  here must also be in QUIPS — the quip stays the duck's own wording. */
export const NOTIFY: Record<string, { title: string; body: string }> = {
  'session.wrapped': { title: 'Session wrapped', body: 'The planning session is finished.' },
  'wizard.committed': {
    title: 'Stories committed',
    body: 'The generated stories are on the board.',
  },
  'run.analysis': { title: 'Analysis complete', body: 'Your analysis has finished running.' },
  'run.standup': { title: 'Standup ready', body: 'Your standup has finished running.' },
  'run.reporting': { title: 'Report ready', body: 'Your delivery report has finished running.' },
  'run.roadmap': { title: 'Roadmap intake done', body: 'Your roadmap has finished processing.' },
  'run.agents': { title: 'Agent report ready', body: 'Your agentwatch report has finished.' },
  'run.ceremony': { title: 'Ceremony finished', body: 'A ceremony has finished running.' },
  'run.failed': { title: 'Run failed', body: 'A run stopped before it finished.' },
};
