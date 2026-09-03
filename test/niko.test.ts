// Niko's wire reducer — pure, so a turn's line order is testable without a
// backend or a DOM. The properties under test are the two the panel depends on:
// `assistant` REPLACES the streamed tokens rather than doubling them, and a
// tool_result closes the call it belongs to rather than appending a second row.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_TEXT_WIDTH,
  COLLAPSED_WIDTH,
  MIN_EXPANDED_HEIGHT,
  type NikoConversation,
  type NikoLine,
  barState,
  draggedHeight,
  emptyTurn,
  messagesOf,
  openWidth,
  reduceTurn,
  summonsNiko,
} from '../src/renderer/lib/yeaboi/niko';
import {
  SLASH_COMMANDS,
  isPrefill,
  isSlashQuery,
  matchSlash,
  slashWindow,
} from '../src/renderer/components/niko/niko-slash';

function fold(lines: NikoLine[]) {
  return lines.reduce(reduceTurn, emptyTurn());
}

describe('reduceTurn', () => {
  it('starts empty', () => {
    const turn = emptyTurn();
    expect(turn.text).toBe('');
    expect(turn.finished).toBe(false);
    expect(turn.toolCalls).toEqual([]);
  });

  it('keeps the op id so Stop has something to cancel', () => {
    expect(fold([{ type: 'op', op_id: 'op-1' }]).opId).toBe('op-1');
  });

  it('appends streamed tokens', () => {
    const turn = fold([
      { type: 'token', text: '$4' },
      { type: 'token', text: '.50' },
    ]);
    expect(turn.text).toBe('$4.50');
  });

  it('lets `assistant` replace the streamed tokens rather than doubling them', () => {
    const turn = fold([
      { type: 'token', text: '$4' },
      { type: 'token', text: '.50' },
      { type: 'assistant', text: '$4.50.' },
    ]);
    expect(turn.text).toBe('$4.50.');
  });

  it('answers a provider that cannot stream at all', () => {
    expect(fold([{ type: 'assistant', text: 'Only this.' }]).text).toBe('Only this.');
  });

  it('opens a tool call with no verdict yet', () => {
    const turn = fold([{ type: 'tool_call', tool_name: 'llm_usage', tool_input: {} }]);
    expect(turn.toolCalls).toEqual([{ name: 'llm_usage' }]);
    expect(turn.toolCalls[0].ok).toBeUndefined();
  });

  it('closes the call it belongs to rather than adding a row', () => {
    const turn = fold([
      { type: 'tool_call', tool_name: 'ship_status', tool_input: {} },
      { type: 'tool_result', tool_name: 'ship_status', ok: false, error: 'no runs yet' },
    ]);
    expect(turn.toolCalls).toEqual([{ name: 'ship_status', ok: false, error: 'no runs yet' }]);
  });

  it('closes the newest open call when the same tool ran twice', () => {
    const turn = fold([
      { type: 'tool_call', tool_name: 'get_session', tool_input: {} },
      { type: 'tool_result', tool_name: 'get_session', ok: true, error: '' },
      { type: 'tool_call', tool_name: 'get_session', tool_input: {} },
      { type: 'tool_result', tool_name: 'get_session', ok: false, error: 'gone' },
    ]);
    expect(turn.toolCalls).toEqual([
      { name: 'get_session', ok: true, error: '' },
      { name: 'get_session', ok: false, error: 'gone' },
    ]);
  });

  it('tolerates a result with no matching call', () => {
    const turn = fold([{ type: 'tool_result', tool_name: 'llm_usage', ok: true, error: '' }]);
    expect(turn.toolCalls).toEqual([{ name: 'llm_usage', ok: true, error: '' }]);
  });

  it('carries the navigation suggestion', () => {
    expect(fold([{ type: 'navigate', route: '/team/retro' }]).route).toBe('/team/retro');
  });

  it('finishes on done, keeping the conversation id and warnings', () => {
    const turn = fold([
      { type: 'assistant', text: 'ok' },
      { type: 'done', conversation_id: 'c1', route: '/usage', warnings: ['partial'] },
    ]);
    expect(turn.finished).toBe(true);
    expect(turn.conversationId).toBe('c1');
    expect(turn.route).toBe('/usage');
    expect(turn.warnings).toEqual(['partial']);
  });

  it('does not let an empty done route erase a navigate', () => {
    const turn = fold([
      { type: 'navigate', route: '/team/retro' },
      { type: 'done', conversation_id: 'c1', route: '', warnings: [] },
    ]);
    expect(turn.route).toBe('/team/retro');
  });

  it('finishes on cancelled without an error', () => {
    const turn = fold([{ type: 'token', text: 'half' }, { type: 'cancelled' }]);
    expect(turn.cancelled).toBe(true);
    expect(turn.finished).toBe(true);
    expect(turn.error).toBe('');
  });

  it('finishes on error with a message', () => {
    const turn = fold([{ type: 'error', message: 'the provider is unreachable' }]);
    expect(turn.error).toBe('the provider is unreachable');
    expect(turn.finished).toBe(true);
  });

  it('falls back to a message when the error carries none', () => {
    expect(fold([{ type: 'error', message: '' }]).error).toBe('The turn stopped.');
  });

  it('ignores an unknown line type — a newer backend is not a failure', () => {
    const before = fold([{ type: 'token', text: 'hi' }]);
    const after = reduceTurn(before, { type: 'thought', text: 'hmm' });
    expect(after).toEqual(before);
  });

  it('ignores a null line', () => {
    const before = emptyTurn();
    expect(reduceTurn(before, null)).toEqual(before);
  });

  it('never mutates the state it was given', () => {
    const before = emptyTurn();
    reduceTurn(before, { type: 'token', text: 'hi' });
    expect(before.text).toBe('');
  });
});

describe('messagesOf', () => {
  const CONVERSATION: NikoConversation = {
    id: 'c1',
    title: 'Agent Spend',
    created_at: '2026-08-27T00:00:00+00:00',
    updated_at: '2026-08-27T00:01:00+00:00',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'what did my agents cost?',
        route: '/agents/usage',
        created_at: '2026-08-27T00:00:00+00:00',
        tool_calls: [],
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'About $41.',
        route: '/agents/usage',
        created_at: '2026-08-27T00:00:30+00:00',
        tool_calls: [{ tool_name: 'agents_usage_history', ok: true, error: '' }],
      },
    ],
  };

  it('replays both roles in order', () => {
    expect(messagesOf(CONVERSATION).map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('keeps the tool calls, so a replayed answer still shows its reason', () => {
    expect(messagesOf(CONVERSATION)[1].toolCalls).toEqual([
      { name: 'agents_usage_history', ok: true, error: '' },
    ]);
  });

  it('keeps the route each turn was asked from', () => {
    expect(messagesOf(CONVERSATION)[0].route).toBe('/agents/usage');
  });

  it('handles an empty conversation', () => {
    expect(messagesOf({ ...CONVERSATION, messages: [] })).toEqual([]);
  });
});

describe('the bar', () => {
  it('is collapsed until it is opened', () => {
    expect(barState(false, 0)).toBe('collapsed');
    expect(barState(false, 12)).toBe('collapsed');
  });

  it('opens to the composer when there is nothing to replay', () => {
    expect(barState(true, 0)).toBe('input');
  });

  it('opens straight to the conversation when there is one', () => {
    expect(barState(true, 1)).toBe('expanded');
  });

  it('falls back to the composer when the conversation is cleared', () => {
    // "New conversation" empties `messages`; the chip-bearing state has to come
    // back on its own, which is the whole reason this is derived not stored.
    expect(barState(true, 4)).toBe('expanded');
    expect(barState(true, 0)).toBe('input');
  });

  it('opens to 38% of the window, clamped', () => {
    expect(openWidth(1200)).toBe(456);
    expect(openWidth(800)).toBe(360); // floor
    expect(openWidth(2560)).toBe(560); // ceiling
  });

  it('never opens narrower than the collapsed pill', () => {
    expect(openWidth(320)).toBeGreaterThan(COLLAPSED_WIDTH);
  });

  it('grows when dragged up and shrinks when dragged down', () => {
    expect(draggedHeight(440, 100, 1000)).toBe(540);
    expect(draggedHeight(440, -100, 1000)).toBe(340);
  });

  it('clamps a drag to a readable band', () => {
    expect(draggedHeight(440, -9999, 1000)).toBe(MIN_EXPANDED_HEIGHT);
    expect(draggedHeight(440, 9999, 1000)).toBe(800); // 80vh
  });
});

describe('slash shortcuts', () => {
  it('only fires on a leading slash', () => {
    expect(isSlashQuery('/usage')).toBe(true);
    expect(isSlashQuery('what about /usage')).toBe(false);
    expect(isSlashQuery('')).toBe(false);
  });

  it('offers everything for a bare slash', () => {
    expect(matchSlash('/')).toHaveLength(SLASH_COMMANDS.length);
  });

  it('narrows on the verb', () => {
    expect(matchSlash('/us').map((c) => c.cmd)).toEqual(['/usage']);
  });

  it('ignores an argument when matching the verb', () => {
    expect(matchSlash('/go /team/retro').map((c) => c.cmd)).toEqual(['/go']);
  });

  it('is case-insensitive', () => {
    expect(matchSlash('/USAGE').map((c) => c.cmd)).toEqual(['/usage']);
  });

  it('offers nothing for a verb that does not exist', () => {
    expect(matchSlash('/teleport')).toEqual([]);
  });

  it('never matches a non-slash line', () => {
    expect(matchSlash('usage')).toEqual([]);
  });

  it('only /go prefills — every other verb is a whole question', () => {
    const prefills = SLASH_COMMANDS.filter(isPrefill).map((c) => c.cmd);
    expect(prefills).toEqual(['/go']);
  });

  it('has no duplicate verbs', () => {
    const cmds = SLASH_COMMANDS.map((c) => c.cmd);
    expect(new Set(cmds).size).toBe(cmds.length);
  });

  it('names no verb that could change something — Niko is read-only', () => {
    // The VERB only. The prompts are prose and legitimately say "a Ship run" or
    // "scheduled"; what must never appear is a command that reads as an action.
    const mutating = /create|delete|update|remove|start|new|set|install|cancel/i;
    const offenders = SLASH_COMMANDS.filter((c) => mutating.test(c.cmd));
    expect(offenders.map((c) => c.cmd)).toEqual([]);
  });
});

describe('slashWindow', () => {
  const all = [...SLASH_COMMANDS];

  it('shows the first three with no peek at the top', () => {
    const rows = slashWindow(all, 0);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(rows.some((r) => r.isPeek)).toBe(false);
  });

  it('adds a peek row once the window has scrolled', () => {
    const rows = slashWindow(all, 5);
    expect(rows[0].isPeek).toBe(true);
    expect(rows.map((r) => r.index)).toEqual([2, 3, 4, 5]);
  });

  it('keeps the selection in the window at the end of the list', () => {
    const last = all.length - 1;
    const rows = slashWindow(all, last);
    expect(rows.map((r) => r.index)).toContain(last);
    expect(rows.filter((r) => !r.isPeek)).toHaveLength(3);
  });

  it('does not overrun a list shorter than the window', () => {
    const rows = slashWindow(all.slice(0, 2), 0);
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
  });

  it('handles a single match', () => {
    expect(slashWindow(all.slice(0, 1), 0).map((r) => r.index)).toEqual([0]);
  });

  it('handles no matches', () => {
    expect(slashWindow([], 0)).toEqual([]);
  });

  it('never marks more than one row as the peek', () => {
    for (let i = 0; i < all.length; i += 1) {
      expect(slashWindow(all, i).filter((r) => r.isPeek)).toHaveLength(i > 2 ? 1 : 0);
    }
  });
});

describe('the collapsed pill', () => {
  // COLLAPSED_WIDTH is derived from Tailwind classes it cannot see, so the
  // regression to catch is a change to the markup, not to the arithmetic —
  // restating the same four numbers here would only pin the constant against a
  // copy of itself. vitest is node-only, so read the JSX.
  const source = readFileSync(
    new URL('../src/renderer/components/niko/niko-bar.tsx', import.meta.url),
    'utf8',
  );

  it('renders the chrome its width is derived from', () => {
    const start = source.indexOf('── The pill ');
    expect(start).toBeGreaterThan(-1);
    const button = source.slice(start, source.indexOf('</button>', start));
    // 2×24 padding, an 16px icon, an 8px gap and a 1px border on each side.
    expect(button).toContain('px-6');
    expect(button).toContain('gap-2');
    expect(button).toMatch(/\bborder\b/);
    expect(button).toContain('size-4');
    expect(button).toContain('<NikoCyclingText />');
  });

  it('is wide enough for the placeholder it renders', () => {
    expect(COLLAPSED_WIDTH - (2 * 1 + 2 * 24 + 16 + 8)).toBeGreaterThanOrEqual(
      COLLAPSED_TEXT_WIDTH,
    );
  });

  it('leaves room for the tip dock beside it at the minimum window', () => {
    // 960 is the main window's minWidth (src/main/index.ts).
    expect(COLLAPSED_WIDTH).toBeLessThan(960 / 2);
  });
});

// Typing anywhere summons Niko — which means one predicate stands between
// every keystroke in the app and a panel opening over it. The cases that
// matter are the ones where it must stay shut: a key aimed at a real field,
// a shortcut, and anything that is not a character.
describe('summonsNiko', () => {
  const base = { key: 'h', metaKey: false, ctrlKey: false, altKey: false };

  it('summons on a printable key with nothing focused', () => {
    expect(summonsNiko({ ...base, target: null })).toBe(true);
  });

  it('summons on digits and punctuation, not just letters', () => {
    for (const key of ['7', '?', '/', ' ']) {
      expect(summonsNiko({ ...base, key, target: null })).toBe(true);
    }
  });

  it('stays shut for a key aimed at a field', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(summonsNiko({ ...base, target: { tagName, isContentEditable: false } })).toBe(false);
    }
  });

  it('stays shut inside a contenteditable', () => {
    expect(summonsNiko({ ...base, target: { tagName: 'DIV', isContentEditable: true } })).toBe(
      false,
    );
  });

  it('stays shut for shortcuts', () => {
    expect(summonsNiko({ ...base, metaKey: true, target: null })).toBe(false);
    expect(summonsNiko({ ...base, ctrlKey: true, target: null })).toBe(false);
    expect(summonsNiko({ ...base, altKey: true, target: null })).toBe(false);
  });

  it('stays shut for named keys', () => {
    for (const key of ['Enter', 'Escape', 'Tab', 'ArrowDown', 'Backspace', 'Shift']) {
      expect(summonsNiko({ ...base, key, target: null })).toBe(false);
    }
  });

  it('summons from a plain element that merely holds focus', () => {
    expect(summonsNiko({ ...base, target: { tagName: 'BUTTON', isContentEditable: false } })).toBe(
      true,
    );
  });
});
