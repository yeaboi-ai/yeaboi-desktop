// The chat's slash commands: the registry names every verb the terminal has
// but the four a window does the ordinary way, each once; a line parses to
// one intent; the menu narrows as the verb is typed; Enter completes a
// half-typed verb and sends a finished one.

import { describe, expect, it } from 'vitest';
import {
  CHAT_COMMANDS,
  completionFor,
  matchingCommands,
  parseCommand,
  unknownCommandNotice,
} from '../src/renderer/lib/yeaboi/commands';
import registry from '../src/renderer/lib/yeaboi/routes.json';

/** The terminal's verbs a window answers with the ordinary thing instead. */
const TERMINAL_ONLY = ['image', 'voice', 'paste', 'quit'];

const ANSWERED = [
  'help',
  'export',
  'skip',
  'defaults',
  'form',
  'finish',
  'summary',
  'questions',
  'edit',
  'small',
  'large',
  'duck',
];

describe('the registry', () => {
  it('names every verb the desktop answers, once, and none it does not', () => {
    const verbs = CHAT_COMMANDS.map((command) => command.tui);
    expect([...verbs].sort()).toEqual([...ANSWERED].sort());
    expect(new Set(verbs).size).toBe(verbs.length);
    for (const verb of TERMINAL_ONLY) expect(verbs).not.toContain(verb);
  });

  it('is what the manifest carries', () => {
    expect(registry.commands).toEqual(CHAT_COMMANDS);
    for (const command of CHAT_COMMANDS) {
      expect(command.name).toMatch(/^[a-z]+$/);
      expect(command.help.length).toBeGreaterThan(0);
      expect(command.help).not.toMatch(/\.$/);
    }
  });
});

describe('parseCommand', () => {
  it('is null for prose, a slash later in the line, or a bare slash', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('see http://x')).toBeNull();
    expect(parseCommand('/')).toBeNull();
  });

  it('turns local verbs into local intents', () => {
    expect(parseCommand('/help')).toEqual({ kind: 'shortcuts' });
    expect(parseCommand('/export')).toEqual({ kind: 'export' });
    expect(parseCommand('/summary')).toEqual({ kind: 'summary' });
    expect(parseCommand('/duck')).toEqual({ kind: 'duck' });
    expect(parseCommand('/questions')).toEqual({ kind: 'questions' });
    expect(parseCommand('/form')).toEqual({ kind: 'questions' });
    expect(parseCommand('/small')).toEqual({ kind: 'size', mode: 'small_project' });
    expect(parseCommand('/LARGE')).toEqual({ kind: 'size', mode: 'smart' });
  });

  it('turns the intake literals into turns', () => {
    expect(parseCommand('/skip')).toEqual({ kind: 'send', text: 'skip' });
    expect(parseCommand('/defaults')).toEqual({ kind: 'send', text: 'defaults' });
    expect(parseCommand('/finish')).toEqual({ kind: 'send', text: 'defaults all' });
    expect(parseCommand('/edit 6')).toEqual({ kind: 'send', text: 'edit 6' });
    expect(parseCommand('/edit')).toEqual({ kind: 'questions' });
  });

  it('names an unknown verb rather than sending it', () => {
    expect(parseCommand('/frobnicate now')).toEqual({ kind: 'unknown', name: 'frobnicate' });
    expect(unknownCommandNotice('frobnicate')).toBe(
      "/frobnicate isn't a command — /help lists them.",
    );
    for (const verb of TERMINAL_ONLY) expect(parseCommand(`/${verb}`)?.kind).toBe('unknown');
  });
});

describe('matchingCommands and completionFor', () => {
  it('narrows the menu as the verb is typed, in registry order', () => {
    expect(matchingCommands('/')).toEqual(CHAT_COMMANDS);
    expect(matchingCommands('/s').map((c) => c.name)).toEqual(['skip', 'summary', 'small']);
    expect(matchingCommands('/sm').map((c) => c.name)).toEqual(['small']);
    expect(matchingCommands('prose')).toEqual([]);
  });

  it('completes a half-typed verb and leaves a finished one to send', () => {
    expect(completionFor('/sm')?.name).toBe('small');
    expect(completionFor('/small')).toBeNull();
    expect(completionFor('/edit 6')).toBeNull();
    expect(completionFor('/s')).toBeNull();
  });
});
