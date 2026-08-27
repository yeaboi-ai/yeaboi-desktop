// Niko's slash shortcuts.
//
// These are **prompt shortcuts, not commands**: each expands into an ordinary
// question Niko answers, nothing routes on them, and the model never sees the
// slash. That is why they live here rather than in routes.json beside the
// planning chat's CHAT_COMMANDS — those name terminal verbs and
// test_tui_parity.py checks them two-way; these name nothing.
//
// Every one of them is a read. Niko has no write tool, so there is no verb here
// that changes anything.

export interface SlashCommand {
  cmd: string;
  label: string;
  /** The question sent to Niko. Ending in a space makes it a prefill instead. */
  prompt: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    cmd: '/usage',
    label: 'What my agents cost',
    prompt: 'What have my AI coding agents been costing me?',
  },
  {
    cmd: '/advisor',
    label: 'Recoverable agent spend',
    prompt: 'How much of my agent spend was recoverable?',
  },
  {
    cmd: '/security',
    label: 'Agent security posture',
    prompt: 'Summarise the security posture of my AI coding agents.',
  },
  {
    cmd: '/agents',
    label: 'What my agents shipped',
    prompt: 'Summarise what my AI agents shipped recently.',
  },
  {
    cmd: '/plans',
    label: 'Saved planning sessions',
    prompt: 'List my saved planning sessions and how far each got.',
  },
  { cmd: '/standups', label: 'Recent standups', prompt: 'Summarise my most recent standup runs.' },
  {
    cmd: '/retros',
    label: 'Recent retros',
    prompt: 'Summarise the actions from my recent retros.',
  },
  {
    cmd: '/poker',
    label: 'Recent poker sessions',
    prompt: 'Summarise my recent planning-poker sessions.',
  },
  { cmd: '/reports', label: 'Recent delivery reports', prompt: 'List my recent delivery reports.' },
  {
    cmd: '/ship',
    label: 'Anything waiting on me',
    prompt: 'Is a Ship run sitting at the approval gate?',
  },
  {
    cmd: '/team',
    label: "My team's profile",
    prompt: "Summarise my team's delivery profile and who is on it.",
  },
  {
    cmd: '/ceremonies',
    label: 'What is scheduled',
    prompt: 'What ceremonies are scheduled, are their jobs installed, and did any fail?',
  },
  {
    cmd: '/provenance',
    label: 'Recent decisions',
    prompt: 'Show me the decisions recorded in the last 30 days.',
  },
  {
    cmd: '/spend',
    label: "yeaboi's own LLM spend",
    prompt: "What has yeaboi's own LLM usage cost me?",
  },
  { cmd: '/help', label: 'What yeaboi can do', prompt: 'Give me a tour of what yeaboi can do.' },
  // The trailing space makes this a prefill rather than a send.
  { cmd: '/go', label: 'Take me somewhere', prompt: 'take me to ' },
] as const;

/** Rows to show at once, plus one dimmed peek above them. */
export const SLASH_WINDOW = 3;

/** True when the composer is asking for the palette. */
export function isSlashQuery(value: string): boolean {
  return value.startsWith('/');
}

/** The commands matching a partly-typed verb, in registry order. */
export function matchSlash(value: string): SlashCommand[] {
  if (!isSlashQuery(value)) return [];
  const verb = value.split(' ')[0].toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.cmd.startsWith(verb));
}

export interface SlashRow {
  command: SlashCommand;
  index: number;
  /** The dimmed row tucked under the window, showing there is more above. */
  isPeek: boolean;
}

/** The carousel's visible rows for a selection — three, plus a peek above. */
export function slashWindow(matches: SlashCommand[], selected: number): SlashRow[] {
  const start = Math.max(0, Math.min(selected - (SLASH_WINDOW - 1), matches.length - SLASH_WINDOW));
  const rows: SlashRow[] = [];
  if (start > 0) rows.push({ command: matches[start - 1], index: start - 1, isPeek: true });
  matches.slice(start, start + SLASH_WINDOW).forEach((command, offset) => {
    rows.push({ command, index: start + offset, isPeek: false });
  });
  return rows;
}

/** A command whose prompt ends in a space is a prefill; anything else sends. */
export function isPrefill(command: SlashCommand): boolean {
  return command.prompt.endsWith(' ');
}
