// The room's state as a pure reducer over the chat wire. A turn is a stream
// of typed lines; each one folds into the state, so the room is a render of
// this and a keydown handler. Testable without a DOM (test/chat-reducer.test.ts).

import {
  bubblesOf,
  needsAdvance,
  type Bubble,
  type ChatLine,
  type ChoiceOption,
  type PendingGate,
  type QuestionView,
  type SessionView,
  type Stage,
} from '@/lib/yeaboi/chat';

export type Awaiting =
  | { type: 'review'; node: string; kind: string; prompt: string }
  | { type: 'choice'; kind: string; prompt: string; options: ChoiceOption[] }
  | { type: 'confirm'; kind: string; prompt: string };

export interface RoomProgress {
  node: string;
  step: number;
  total: number;
  status: 'running' | 'done';
}

export interface RoomState {
  bubbles: Bubble[];
  /** The reply as it streams, before its finished line lands. */
  pending: string;
  stage: Stage;
  question: QuestionView | null;
  opId: string;
  busy: boolean;
  error: string;
  /** A dim local line under the transcript. */
  notice: string;
  /** Pasted image paths, in chip order. */
  attachments: string[];
  /** The gate the conversation is parked on, if any. */
  awaiting: Awaiting | null;
  /** The pipeline step in flight, while there is one. */
  progress: RoomProgress | null;
  /** The plan changed since the drawer last read it. */
  planDirty: boolean;
  /** The conversation is parked on a stage only advanceTurn can leave. */
  needsAdvance: boolean;
  /** Something the room should do: a sync typed at a gate. */
  action: { name: string; tracker: string } | null;
  /** A turn broke off on a stage only advanceTurn can leave; the reader continues by hand. */
  stalled: boolean;
}

export function emptyRoom(): RoomState {
  return {
    bubbles: [],
    pending: '',
    stage: 'intake',
    question: null,
    opId: '',
    busy: false,
    error: '',
    notice: '',
    attachments: [],
    awaiting: null,
    progress: null,
    planDirty: false,
    needsAdvance: false,
    action: null,
    stalled: false,
  };
}

function awaitingOf(gate: PendingGate | ChatLine | null | undefined): Awaiting | null {
  if (!gate) return null;
  switch (gate.type) {
    case 'await_review':
      return { type: 'review', node: gate.node, kind: gate.kind, prompt: gate.prompt };
    case 'await_choice':
      return { type: 'choice', kind: gate.kind, prompt: gate.prompt, options: gate.options };
    case 'await_confirm':
      return { type: 'confirm', kind: gate.kind, prompt: gate.prompt };
    default:
      return null;
  }
}

/** The room as a session view leaves it: the transcript replayed, the parked
 *  gate restored, the stage set — what a reloaded window starts from. */
export function fromView(view: SessionView): RoomState {
  return {
    ...emptyRoom(),
    bubbles: bubblesOf(view.transcript),
    stage: view.stage,
    question: view.question ?? null,
    awaiting: awaitingOf(view.pending),
    needsAdvance: needsAdvance(view.stage),
  };
}

/** The reader's message goes up at once; the turn then runs. */
export function beginTurn(state: RoomState, text: string): RoomState {
  return {
    ...state,
    bubbles: text ? [...state.bubbles, { role: 'user', text }] : state.bubbles,
    pending: '',
    busy: true,
    error: '',
    notice: '',
    attachments: [],
    awaiting: null,
    action: null,
    needsAdvance: false,
    stalled: false,
  };
}

/** One line of the stream, folded in. */
export function reduceLine(state: RoomState, line: ChatLine): RoomState {
  switch (line.type) {
    case 'op':
      return { ...state, opId: line.op_id };
    case 'token':
      return { ...state, pending: state.pending + line.text };
    case 'user':
    case 'assistant':
    case 'question':
    case 'artifact':
    case 'notice':
      // The finished line carries what the tokens spelled out, so the pending
      // bubble gives way to it rather than doubling it.
      return { ...state, pending: '', bubbles: [...state.bubbles, ...bubblesOf([line])] };
    case 'await_confirm':
    case 'await_review':
    case 'await_choice':
      return {
        ...state,
        pending: '',
        bubbles: [...state.bubbles, ...bubblesOf([line])],
        awaiting: awaitingOf(line),
      };
    case 'progress':
      return {
        ...state,
        progress:
          line.status === 'done'
            ? null
            : { node: line.node, step: line.step, total: line.total, status: line.status },
      };
    case 'section':
      return { ...state, planDirty: true };
    case 'action':
      return { ...state, action: { name: line.name, tracker: line.detail ?? '' } };
    case 'done':
      return { ...state, stage: line.stage, needsAdvance: needsAdvance(line.stage) };
    case 'cancelled':
      return { ...state, error: 'Cancelled — nothing was changed.', awaiting: state.awaiting };
    case 'error':
      return { ...state, error: line.message };
  }
}

/** The stream is over, however it ended. */
export function endTurn(state: RoomState): RoomState {
  // A cancelled or failed step leaves the stage where it was; the room does
  // not ask again on its own, it offers to.
  const stalled = state.error !== '' && needsAdvance(state.stage);
  return { ...state, pending: '', opId: '', busy: false, progress: null, stalled };
}

/** The view read back after a turn: the question follows it, and a gate the
 *  stream did not park on itself comes back from the view — a cancelled or
 *  failed turn leaves the gate where it was. */
export function restoreGate(state: RoomState, view: SessionView): RoomState {
  return {
    ...state,
    stage: view.stage,
    question: view.question ?? null,
    awaiting: state.awaiting ?? awaitingOf(view.pending),
  };
}

/** The drawer has read the plan again. */
export function planRead(state: RoomState): RoomState {
  return { ...state, planDirty: false };
}

/** The room did what the action asked. */
export function actionTaken(state: RoomState): RoomState {
  return { ...state, action: null };
}

/** A pasted image, kept by its path in chip order. */
export function attach(state: RoomState, path: string): RoomState {
  return { ...state, attachments: [...state.attachments, path] };
}

/** The quick replies a parked gate offers, in the words the engine accepts.
 *  A confirmation that is not a tool write is the intake's own verdicts, so
 *  the question's choices are what to offer there. */
export function quickReplies(
  awaiting: Awaiting | null,
  question: QuestionView | null = null,
): { label: string; text: string }[] {
  const choices = (question?.choices ?? []).map(([label]) => ({ label, text: label }));
  if (!awaiting) return choices;
  switch (awaiting.type) {
    case 'review':
      return [
        { label: 'Accept', text: 'accept' },
        { label: 'Edit', text: 'edit ' },
      ];
    case 'choice':
      return awaiting.options.map((option) => ({ label: option.label, text: option.key }));
    case 'confirm':
      if (awaiting.kind === 'tool_write') {
        return [
          { label: 'Yes', text: 'yes' },
          { label: 'No', text: 'no' },
        ];
      }
      return choices.length ? choices : [{ label: 'Confirm', text: 'confirm' }];
  }
}
