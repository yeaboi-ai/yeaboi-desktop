// Niko's wire — the shapes contracts/v1/app_http.md pins, the calls that
// produce them, and the pure reducer over a turn's events (a plain function,
// so the vitest suite can drive it without a DOM).
//
// Niko is read-only by construction: nothing here posts a change. The one
// route it can produce is a *suggestion* the window may push.

import { apiGet, apiPost, apiStream } from './api';

export type NikoLine =
  | { type: 'op'; op_id: string }
  | { type: 'token'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'tool_call'; tool_name: string; tool_input: Record<string, unknown> }
  | { type: 'tool_result'; tool_name: string; ok: boolean; error: string }
  | { type: 'navigate'; route: string }
  | { type: 'done'; conversation_id: string; route: string; warnings: string[] }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface NikoToolCall {
  name: string;
  /** Undefined while the tool is still running. */
  ok?: boolean;
  error?: string;
}

export interface NikoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: NikoToolCall[];
  route?: string;
}

export interface NikoConversationRow {
  id: string;
  title: string;
  messages: number;
  created_at: string;
  updated_at: string;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  route: string;
  created_at: string;
  tool_calls: { tool_name: string; ok: boolean; error: string }[];
}

export interface NikoConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
}

export interface NikoSuggestion {
  label: string;
  prompt: string;
  icon?: string;
}

// ── calls ──────────────────────────────────────────────────────────────────

export function createConversation(): Promise<NikoConversation> {
  return apiPost<NikoConversation>('/api/niko/conversations');
}

export function loadConversation(id: string): Promise<NikoConversation> {
  return apiGet<NikoConversation>(`/api/niko/conversations/${encodeURIComponent(id)}`);
}

export function listConversations(): Promise<{ conversations: NikoConversationRow[] }> {
  return apiGet<{ conversations: NikoConversationRow[] }>('/api/niko/conversations');
}

export function archiveConversation(id: string): Promise<unknown> {
  return apiPost(`/api/niko/conversations/${encodeURIComponent(id)}/delete`);
}

export function loadSuggestions(route: string): Promise<{ suggestions: NikoSuggestion[] }> {
  return apiGet<{ suggestions: NikoSuggestion[] }>(
    `/api/niko/suggestions?route=${encodeURIComponent(route)}`,
  );
}

export function sendTurn(
  conversationId: string,
  question: string,
  onLine: (line: NikoLine) => void,
  context: { route?: string; userName?: string } = {},
): Promise<void> {
  return apiStream(
    `/api/niko/conversations/${encodeURIComponent(conversationId)}/send`,
    {
      question,
      ...(context.route ? { route: context.route } : {}),
      ...(context.userName ? { user_name: context.userName } : {}),
    },
    (line) => onLine(line as NikoLine),
  );
}

export function cancelTurn(opId: string): Promise<unknown> {
  return apiPost(`/api/ops/${encodeURIComponent(opId)}/cancel`);
}

// ── the reducer ────────────────────────────────────────────────────────────

export interface NikoTurnState {
  opId: string;
  /** The answer so far — streamed tokens, replaced whole by `assistant`. */
  text: string;
  toolCalls: NikoToolCall[];
  route: string;
  warnings: string[];
  conversationId: string;
  error: string;
  cancelled: boolean;
  finished: boolean;
}

export function emptyTurn(): NikoTurnState {
  return {
    opId: '',
    text: '',
    toolCalls: [],
    route: '',
    warnings: [],
    conversationId: '',
    error: '',
    cancelled: false,
    finished: false,
  };
}

/** Fold one line into the turn's state. Returns a new object. */
export function reduceTurn(state: NikoTurnState, line: unknown): NikoTurnState {
  const row = (line ?? {}) as NikoLine;
  switch (row.type) {
    case 'op':
      return { ...state, opId: row.op_id };
    case 'token':
      return { ...state, text: state.text + row.text };
    case 'assistant':
      // Replaces rather than appends: a provider that cannot stream sends only
      // this, and one that can has already streamed the same text.
      return { ...state, text: row.text };
    case 'tool_call':
      return { ...state, toolCalls: [...state.toolCalls, { name: row.tool_name }] };
    case 'tool_result':
      return { ...state, toolCalls: closeCall(state.toolCalls, row.tool_name, row.ok, row.error) };
    case 'navigate':
      return { ...state, route: row.route };
    case 'done':
      return {
        ...state,
        conversationId: row.conversation_id,
        route: row.route || state.route,
        warnings: row.warnings ?? [],
        finished: true,
      };
    case 'cancelled':
      return { ...state, cancelled: true, finished: true };
    case 'error':
      return { ...state, error: row.message || 'The turn stopped.', finished: true };
    default:
      // An unknown line type is a newer backend, not a failure — ignore it.
      return state;
  }
}

/** Close the newest still-running call with that name. */
function closeCall(
  calls: NikoToolCall[],
  name: string,
  ok: boolean,
  error: string,
): NikoToolCall[] {
  const index = calls
    .map((call, i) => ({ call, i }))
    .filter(({ call }) => call.name === name && call.ok === undefined)
    .pop()?.i;
  if (index === undefined) return [...calls, { name, ok, error }];
  const next = [...calls];
  next[index] = { name, ok, error };
  return next;
}

/** A stored conversation as the messages the panel renders. */
export function messagesOf(conversation: NikoConversation): NikoMessage[] {
  return conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    route: message.route,
    toolCalls: message.tool_calls.map((call) => ({
      name: call.tool_name,
      ok: call.ok,
      error: call.error,
    })),
  }));
}

// ── the bar's geometry and state, as plain functions ───────────────────────
//
// Kept out of the component so vitest can drive them with no DOM, the same
// split `reduceTurn` above uses.

/**
 * The rotating placeholder's box, fixed in px so the pill's width never moves as
 * phrases swap (see niko-cycling-text.tsx). Wide enough for the longest phrase.
 */
export const COLLAPSED_TEXT_WIDTH = 175;

/** The pill's chrome around that box: a 1px border, `px-6`, a `size-4` icon, `gap-2`. */
const COLLAPSED_CHROME = 2 * 1 + 2 * 24 + 16 + 8;

/** Sized from its content, so the box it renders always fits. */
export const COLLAPSED_WIDTH = COLLAPSED_TEXT_WIDTH + COLLAPSED_CHROME;
export const COLLAPSED_HEIGHT = 44;
export const INPUT_HEIGHT = 52;
export const DEFAULT_EXPANDED_HEIGHT = 440;
export const MIN_EXPANDED_HEIGHT = 200;

/** How wide the bar opens. Planning's rule, unchanged. */
export function openWidth(innerWidth: number): number {
  return Math.min(560, Math.max(360, innerWidth * 0.38));
}

/** How tall a drag leaves the expanded bar. Dragging UP grows it. */
export function draggedHeight(startHeight: number, delta: number, innerHeight: number): number {
  return Math.max(MIN_EXPANDED_HEIGHT, Math.min(innerHeight * 0.8, startHeight + delta));
}

export type BarState = 'collapsed' | 'input' | 'expanded';

/**
 * The bar's shape, derived rather than stored.
 *
 * Reproduces planning's `handleOpen` (`messages.length > 0 ? expanded : input`)
 * without a second source of truth: clearing the conversation drops back to the
 * chip-bearing input state on its own.
 */
export function barState(isOpen: boolean, messageCount: number): BarState {
  if (!isOpen) return 'collapsed';
  return messageCount > 0 ? 'expanded' : 'input';
}
