// The room's reducer: every line type folds into the state, a replayed view
// restores the parked gate, `done` sets the stage and says when the room has
// to ask for the next step itself, and a cancelled turn keeps its bubbles.

import { describe, expect, it } from 'vitest';
import {
  actionTaken,
  attach,
  beginTurn,
  emptyRoom,
  endTurn,
  fromView,
  planRead,
  quickReplies,
  reduceLine,
  type RoomState,
} from '../src/renderer/lib/planning/chat-reducer';
import type { ChatLine, SessionView } from '../src/renderer/lib/yeaboi/chat';

const QUESTION = {
  question_text: '',
  preamble_lines: [],
  choices: null,
  multi_select: false,
  auto_submit: false,
  prior_art: false,
  suggestion: null,
  progress: '',
  phase_label: '',
  current_question: 0,
};

const view = (over: Partial<SessionView> = {}): SessionView => ({
  session_id: 's1',
  stage: 'intake',
  transcript: [],
  question: QUESTION,
  opening: '',
  ...over,
});

const run = (state: RoomState, lines: ChatLine[]): RoomState =>
  lines.reduce((acc, line) => reduceLine(acc, line), state);

describe('fromView', () => {
  it('replays the transcript and restores the parked gate', () => {
    const state = fromView(
      view({
        stage: 'review',
        transcript: [
          { type: 'user', text: 'a barber app' },
          { type: 'assistant', text: 'Got it.' },
          { type: 'artifact', kind: 'analysis' },
        ],
        pending: {
          type: 'await_review',
          node: 'project_analyzer',
          kind: 'analysis',
          prompt: 'Accept?',
        },
      }),
    );
    expect(state.bubbles.map((b) => b.role)).toEqual(['user', 'assistant', 'card']);
    expect(state.stage).toBe('review');
    expect(state.awaiting).toEqual({
      type: 'review',
      node: 'project_analyzer',
      kind: 'analysis',
      prompt: 'Accept?',
    });
    expect(state.needsAdvance).toBe(false);
  });

  it('knows a reloaded pipeline stage still owes a step', () => {
    expect(fromView(view({ stage: 'pipeline' })).needsAdvance).toBe(true);
    expect(fromView(view({ stage: 'epic' })).needsAdvance).toBe(true);
    expect(fromView(view({ stage: 'chat' })).needsAdvance).toBe(false);
  });

  it('accepts a view with no gate at all', () => {
    expect(fromView(view()).awaiting).toBeNull();
    expect(fromView(view({ pending: null })).awaiting).toBeNull();
  });
});

describe('beginTurn', () => {
  it('posts the message at once, clears what the last turn left, and goes busy', () => {
    const before = { ...emptyRoom(), error: 'old', notice: 'old', attachments: ['/a.png'] };
    const state = beginTurn(before, 'split it in two');
    expect(state.bubbles).toEqual([{ role: 'user', text: 'split it in two' }]);
    expect(state.busy).toBe(true);
    expect(state.error).toBe('');
    expect(state.notice).toBe('');
    expect(state.attachments).toEqual([]);
  });

  it('adds no bubble for a synthetic empty turn', () => {
    expect(beginTurn(emptyRoom(), '').bubbles).toEqual([]);
  });
});

describe('reduceLine', () => {
  it('streams tokens into the pending bubble and lets the finished line replace it', () => {
    let state = run(emptyRoom(), [
      { type: 'op', op_id: 'op-1' },
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
    ]);
    expect(state.opId).toBe('op-1');
    expect(state.pending).toBe('Hello');
    state = reduceLine(state, { type: 'assistant', text: 'Hello' });
    expect(state.pending).toBe('');
    expect(state.bubbles).toEqual([{ role: 'assistant', text: 'Hello' }]);
  });

  it('draws a question, an artifact and a notice as their own rows', () => {
    const state = run(emptyRoom(), [
      { type: 'question', text: 'Team size?', number: 6 },
      { type: 'artifact', kind: 'features' },
      { type: 'notice', text: 'Switched to Large.' },
    ]);
    expect(state.bubbles).toEqual([
      { role: 'assistant', text: 'Team size?' },
      { role: 'card', text: '', kind: 'features' },
      { role: 'notice', text: 'Switched to Large.' },
    ]);
  });

  it('parks on a review gate, a choice, and a tool-write confirmation', () => {
    const review = reduceLine(emptyRoom(), {
      type: 'await_review',
      node: 'story_writer',
      kind: 'stories',
      prompt: 'Reply accept…',
    });
    expect(review.awaiting?.type).toBe('review');
    expect(review.bubbles.at(-1)).toEqual({ role: 'assistant', text: 'Reply accept…' });

    const choice = reduceLine(emptyRoom(), {
      type: 'await_choice',
      kind: 'capacity',
      prompt: 'Over capacity.',
      options: [
        { key: 'extend', label: 'Add a sprint' },
        { key: 'team', label: 'Add an engineer' },
      ],
    });
    expect(choice.awaiting).toMatchObject({ type: 'choice', kind: 'capacity' });
    expect(quickReplies(choice.awaiting).map((r) => r.text)).toEqual(['extend', 'team']);

    const confirm = reduceLine(emptyRoom(), {
      type: 'await_confirm',
      kind: 'tool_write',
      prompt: "I'd like to perform the following write operation(s):",
    });
    expect(confirm.awaiting?.type).toBe('confirm');
    expect(quickReplies(confirm.awaiting).map((r) => r.text)).toEqual(['yes', 'no']);
    // The card the terminal draws before the prompt survives.
    expect(confirm.bubbles[0]).toEqual({ role: 'card', text: '', kind: 'tool_write' });
  });

  it('offers accept and edit at a review gate, and nothing when there is none', () => {
    const state = reduceLine(emptyRoom(), {
      type: 'await_review',
      node: 'feature_generator',
      kind: 'features',
      prompt: 'p',
    });
    expect(quickReplies(state.awaiting).map((r) => r.label)).toEqual(['Accept', 'Edit']);
    expect(quickReplies(null)).toEqual([]);
  });

  it('tracks a step in flight and clears it when it lands', () => {
    let state = reduceLine(emptyRoom(), {
      type: 'progress',
      node: 'story_writer',
      step: 3,
      total: 6,
      status: 'running',
    });
    expect(state.progress).toEqual({ node: 'story_writer', step: 3, total: 6, status: 'running' });
    state = reduceLine(state, {
      type: 'progress',
      node: 'story_writer',
      step: 3,
      total: 6,
      status: 'done',
    });
    expect(state.progress).toBeNull();
  });

  it('marks the plan dirty on a section line until the drawer reads it', () => {
    const state = reduceLine(emptyRoom(), {
      type: 'section',
      kind: 'features',
      status: 'accepted',
      version: 2,
    });
    expect(state.planDirty).toBe(true);
    expect(planRead(state).planDirty).toBe(false);
  });

  it('hands an action to the room, once', () => {
    const state = reduceLine(emptyRoom(), { type: 'action', name: 'sync', detail: 'jira' });
    expect(state.action).toEqual({ name: 'sync', tracker: 'jira' });
    expect(actionTaken(state).action).toBeNull();
  });

  it('sets the stage on done and says when the room must advance itself', () => {
    expect(reduceLine(emptyRoom(), { type: 'done', stage: 'pipeline' })).toMatchObject({
      stage: 'pipeline',
      needsAdvance: true,
    });
    expect(reduceLine(emptyRoom(), { type: 'done', stage: 'epic' }).needsAdvance).toBe(true);
    expect(reduceLine(emptyRoom(), { type: 'done', stage: 'review' }).needsAdvance).toBe(false);
  });

  it('keeps the bubbles when a turn is cancelled or fails', () => {
    const before = beginTurn(emptyRoom(), 'hi');
    const cancelled = reduceLine(before, { type: 'cancelled' });
    expect(cancelled.bubbles).toEqual(before.bubbles);
    expect(cancelled.error).toMatch(/Cancelled/);
    const failed = reduceLine(before, { type: 'error', message: 'The turn stopped.' });
    expect(failed.error).toBe('The turn stopped.');
    expect(failed.bubbles).toEqual(before.bubbles);
  });
});

describe('endTurn and attach', () => {
  it('clears the stream state and nothing else', () => {
    const mid = { ...beginTurn(emptyRoom(), 'x'), pending: 'half', opId: 'op-1', progress: null };
    const done = endTurn(mid);
    expect(done).toMatchObject({ pending: '', opId: '', busy: false });
    expect(done.bubbles).toEqual(mid.bubbles);
  });

  it('keeps pasted images in chip order', () => {
    const state = attach(attach(emptyRoom(), '/a.png'), '/b.png');
    expect(state.attachments).toEqual(['/a.png', '/b.png']);
  });
});

describe('a turn that breaks off', () => {
  const parked = { ...emptyRoom(), stage: 'pipeline' as const };

  it('leaves the room offering to continue rather than asking again on its own', () => {
    const failed = reduceLine(beginTurn(parked, ''), { type: 'error', message: 'boom' });
    const ended = endTurn(failed);
    expect(ended.needsAdvance).toBe(false);
    expect(ended.stalled).toBe(true);
    expect(ended.busy).toBe(false);
  });

  it('does not offer it on a stage the reader leaves by replying', () => {
    const chatting = { ...emptyRoom(), stage: 'chat' as const };
    const failed = reduceLine(beginTurn(chatting, 'hi'), { type: 'cancelled' });
    expect(endTurn(failed).stalled).toBe(false);
  });

  it('is over once the next turn starts or a step lands', () => {
    const stalled = endTurn(reduceLine(beginTurn(parked, ''), { type: 'error', message: 'x' }));
    expect(beginTurn(stalled, '').stalled).toBe(false);
    const landed = reduceLine(beginTurn(stalled, ''), { type: 'done', stage: 'review' });
    expect(endTurn(landed).stalled).toBe(false);
  });
});

describe('quick replies at a confirmation', () => {
  it("offers the question's own verdicts when the gate is not a tool write", () => {
    const state = reduceLine(emptyRoom(), {
      type: 'await_confirm',
      kind: 'intake_summary',
      prompt: 'Does this look right?',
    });
    const question = {
      ...QUESTION,
      choices: [
        ['Looks right', true],
        ['Change something', false],
      ] as [string, boolean][],
    };
    expect(quickReplies(state.awaiting, question).map((r) => r.text)).toEqual([
      'Looks right',
      'Change something',
    ]);
    // Without verdicts there is still one word to say.
    expect(quickReplies(state.awaiting, QUESTION).map((r) => r.text)).toEqual(['confirm']);
  });

  it('keeps yes and no for a tool write whatever the question says', () => {
    const state = reduceLine(emptyRoom(), {
      type: 'await_confirm',
      kind: 'tool_write',
      prompt: 'p',
    });
    const question = { ...QUESTION, choices: [['Looks right', true]] as [string, boolean][] };
    expect(quickReplies(state.awaiting, question).map((r) => r.text)).toEqual(['yes', 'no']);
  });

  it("offers a question's choices when nothing is parked", () => {
    const question = {
      ...QUESTION,
      choices: [
        ['Yes', true],
        ['No', false],
      ] as [string, boolean][],
    };
    expect(quickReplies(null, question).map((r) => r.label)).toEqual(['Yes', 'No']);
  });
});
