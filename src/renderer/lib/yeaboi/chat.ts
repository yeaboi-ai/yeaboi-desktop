// The planning chat's wire — the shapes contracts/v1/app_http.md pins, plus
// the calls that produce them. The reducer over a turn's events lives here
// too (a plain function, so the vitest suite can drive it without a DOM).

import { apiGet, apiPost, apiStream } from './api';
import type { PlanVersionRef, PlanView, SectionKey, SectionStatus } from '@/lib/planning/plan-view';

/** The stages the conversation can be parked on — the one predicate every surface routes on. */
export type Stage = 'intake' | 'review' | 'pipeline' | 'epic' | 'capacity' | 'spike' | 'chat';

export interface QuestionView {
  question_text: string;
  preamble_lines: string[];
  choices: [string, boolean][] | null;
  multi_select: boolean;
  auto_submit: boolean;
  prior_art: boolean;
  suggestion: string | null;
  progress: string;
  phase_label: string;
  current_question: number;
}

export interface ChoiceOption {
  key: string;
  label: string;
}

/** One line of a turn. The type tag is the contract (app_http.md, Planning room routes). */
export type ChatLine =
  | { type: 'op'; op_id: string }
  | { type: 'token'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'user'; text: string }
  | { type: 'question'; text: string; number: number }
  /** A confirmation the graph parks on; `tool_write` is the tracker-write gate. */
  | { type: 'await_confirm'; kind: string; prompt: string }
  /** A pipeline gate: reply accept, edit …, or free text to refine. */
  | { type: 'await_review'; node: string; kind: string; prompt: string }
  /** The capacity or spike question; reply with an option key. */
  | { type: 'await_choice'; kind: string; prompt: string; options: ChoiceOption[] }
  | { type: 'artifact'; kind: string }
  | { type: 'progress'; node: string; step: number; total: number; status: 'running' | 'done' }
  /** A plan section changed — refetch the plan view. */
  | { type: 'section'; kind: SectionKey; status: SectionStatus; version: number }
  /** A dim local line, never persisted. */
  | { type: 'notice'; text: string }
  /** Something the room does rather than says: a sync typed at a gate; `detail` names the tracker. */
  | { type: 'action'; name: string; detail?: string }
  | { type: 'done'; stage: Stage }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

/** The gate a reloaded window redraws its buttons from. */
export type PendingGate =
  | { type: 'await_review'; node: string; kind: string; prompt: string }
  | { type: 'await_choice'; kind: string; prompt: string; options: ChoiceOption[] }
  | { type: 'await_confirm'; kind: string; prompt: string };

export interface ProgressStep {
  node: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export interface SessionView {
  /** The engine's session id. An older sidecar names it `project_id`. */
  session_id?: string;
  project_id?: string;
  title?: string;
  project_label?: string;
  tags?: string[];
  stage: Stage;
  intake_mode?: string;
  created_at?: string;
  last_modified?: string;
  transcript: ChatLine[];
  question: QuestionView;
  /** The description, until it has been sent as the conversation's first turn. */
  opening: string;
  progress?: { steps: ProgressStep[]; step: number; total: number };
  pending?: PendingGate | null;
  sections?: { kind: SectionKey; status: SectionStatus; version: number }[];
}

/** The id a view answers to, whichever name the sidecar gave it. */
export function sessionIdOf(view: Pick<SessionView, 'session_id' | 'project_id'>): string {
  return view.session_id ?? view.project_id ?? '';
}

/** One row of the planning hub. */
export interface ChatSummary {
  session_id: string;
  /** The reader's name for the plan; empty until renamed. */
  title: string;
  /** The engine's name for it, from the analysis. */
  project_name: string;
  project_label: string;
  tags: string[];
  stage: Stage;
  created_at: string;
  last_modified: string;
  last_node_completed: string;
  counts: { features: number; stories: number; tasks: number; sprints: number };
}

export interface CreateChatOptions {
  description: string;
  intakeMode?: '' | 'small_project' | 'smart';
  solo?: boolean;
  analysisProfileId?: string;
  title?: string;
  projectLabel?: string;
  tags?: string[];
  /** A context scope's JSON twin (lib/context/scope.ts, serializeScope). */
  context?: object;
}

/** One drawn row of the conversation. Cards carry a kind, prose carries
 *  text, a notice is a dim local line. */
export interface Bubble {
  role: 'user' | 'assistant' | 'card' | 'notice';
  text: string;
  kind?: string;
}

/** The body `POST /api/chat/sessions` takes: every key but the description is
 *  sent only when set. `solo` opens a one-person intake. */
export function createChatBody(options: CreateChatOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { description: options.description };
  if (options.intakeMode) body['intake_mode'] = options.intakeMode;
  if (options.solo) body['solo'] = true;
  if (options.analysisProfileId) body['analysis_profile_id'] = options.analysisProfileId;
  if (options.title?.trim()) body['title'] = options.title.trim();
  if (options.projectLabel?.trim()) body['project_label'] = options.projectLabel.trim();
  if (options.tags?.length) body['tags'] = [...options.tags];
  if (options.context) body['context'] = options.context;
  return body;
}

export function createChat(options: CreateChatOptions): Promise<SessionView> {
  return apiPost<SessionView>('/api/chat/sessions', createChatBody(options));
}

export interface ChatListQuery {
  limit?: number;
  projectLabel?: string;
  tag?: string;
}

/** What a plan is called on a row: the reader's title, else the engine's name. */
export function planName(row: Pick<ChatSummary, 'title' | 'project_name'>): string {
  return row.title || row.project_name || 'Untitled plan';
}

/** The planning hub's rows, newest first. */
export async function listChats(query: ChatListQuery = {}): Promise<ChatSummary[]> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.projectLabel) params.set('project_label', query.projectLabel);
  if (query.tag) params.set('tag', query.tag);
  const suffix = params.toString();
  const body = await apiGet<{ sessions: ChatSummary[] }>(
    `/api/chat/sessions${suffix ? `?${suffix}` : ''}`,
  );
  return body.sessions;
}

export interface ChatPatch {
  title?: string;
  projectLabel?: string;
  /** Replaces the list, the fixed tags included. */
  tags?: string[];
  /** A scope's JSON twin; null clears it. */
  context?: object | null;
}

/** The title, the labels or the scope of one plan. The sidecar is reached over
 *  GET and POST alone, so this is a POST rather than a PATCH. */
export function updateChat(
  sessionId: string,
  patch: ChatPatch,
): Promise<{
  session_id: string;
  title: string;
  project_label: string;
  tags: string[];
  context: object | null;
}> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body['title'] = patch.title;
  if (patch.projectLabel !== undefined) body['project_label'] = patch.projectLabel;
  if (patch.tags !== undefined) body['tags'] = patch.tags;
  if (patch.context !== undefined) body['context'] = patch.context;
  return apiPost(`/api/chat/sessions/${encodeURIComponent(sessionId)}/update`, body);
}

export function deleteChat(sessionId: string): Promise<{ deleted: boolean; session_id: string }> {
  return apiPost(`/api/chat/sessions/${encodeURIComponent(sessionId)}/delete`);
}

/** One step the conversation takes on its own — the next pipeline stage, or
 *  the epic — streamed like a turn. Only the `pipeline` and `epic` stages
 *  accept it; the reducer says when (needsAdvance). */
export function advanceTurn(sessionId: string, onLine: (line: ChatLine) => void): Promise<void> {
  return apiStream(`/api/chat/sessions/${encodeURIComponent(sessionId)}/advance`, {}, (line) =>
    onLine(line as ChatLine),
  );
}

export function loadPlanView(sessionId: string): Promise<PlanView> {
  return apiGet<PlanView>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/plan`);
}

export async function loadPlanVersions(sessionId: string): Promise<PlanVersionRef[]> {
  const body = await apiGet<{ versions: PlanVersionRef[] }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/plan/versions`,
  );
  return body.versions;
}

export function loadChat(projectId: string): Promise<SessionView> {
  return apiGet<SessionView>(`/api/chat/sessions/${encodeURIComponent(projectId)}`);
}

/**
 * One turn. `images` is the composer's whole attachment list, in order.
 *
 * Which of them travel is the backend's decision, taken from the `[image #N]`
 * chips still in the text — so deleting a chip detaches its image, and the
 * rule has one implementation rather than one per surface.
 */
export function sendTurn(
  projectId: string,
  text: string,
  onLine: (line: ChatLine) => void,
  images: string[] = [],
): Promise<void> {
  return apiStream(
    `/api/chat/sessions/${encodeURIComponent(projectId)}/send`,
    images.length ? { text, images } : { text },
    (line) => onLine(line as ChatLine),
  );
}

export function cancelTurn(opId: string): Promise<unknown> {
  return apiPost(`/api/ops/${encodeURIComponent(opId)}/cancel`);
}

export interface PlannedQuestion {
  number: number;
  label: string;
  answer: string;
  /** An essential gap this run still has to ask. */
  remaining: boolean;
  skipped: boolean;
}

export interface QuestionPlan {
  questions: PlannedQuestion[];
  total: number;
  completed: boolean;
  /** False when the gap derivation failed — the list is then answers only. */
  derived: boolean;
}

export function loadQuestions(projectId: string): Promise<QuestionPlan> {
  return apiGet<QuestionPlan>(`/api/chat/sessions/${encodeURIComponent(projectId)}/questions`);
}

export function switchSize(
  projectId: string,
  mode: 'small_project' | 'smart',
): Promise<{ changed: boolean; mode: string; reopened?: boolean }> {
  return apiPost(`/api/chat/sessions/${encodeURIComponent(projectId)}/size`, { mode });
}

/**
 * Keep one pasted image and get its chip back.
 *
 * `index` is the attachment's 1-based place in the composer's list, which is
 * what the chip names — the backend decides at send time which chips survived,
 * so the two have to agree.
 */
export function attachImage(
  projectId: string,
  image: string,
  mime: string,
  index: number,
): Promise<{ path: string; chip: string }> {
  return apiPost(`/api/chat/sessions/${encodeURIComponent(projectId)}/attachments`, {
    image,
    mime,
    index,
  });
}

/** The transcript a session view draws as, ignoring the lines that are not
 *  rows (op, token, progress, section, action, done). */
export function bubblesOf(lines: ChatLine[]): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const line of lines) {
    if (line.type === 'user') bubbles.push({ role: 'user', text: line.text });
    else if (line.type === 'assistant' || line.type === 'question')
      bubbles.push({ role: 'assistant', text: line.text });
    else if (line.type === 'artifact') bubbles.push({ role: 'card', text: '', kind: line.kind });
    else if (line.type === 'await_confirm') {
      bubbles.push({ role: 'card', text: '', kind: line.kind });
      bubbles.push({ role: 'assistant', text: line.prompt });
    } else if (line.type === 'await_review' || line.type === 'await_choice')
      bubbles.push({ role: 'assistant', text: line.prompt });
    else if (line.type === 'notice') bubbles.push({ role: 'notice', text: line.text });
  }
  return bubbles;
}

/** What a finished turn leaves behind: new bubbles, the new stage, how it ended. */
export interface TurnResult {
  bubbles: Bubble[];
  stage: Stage | null;
  opId: string;
  error: string;
  cancelled: boolean;
}

export function reduceTurn(lines: ChatLine[]): TurnResult {
  const result: TurnResult = { bubbles: [], stage: null, opId: '', error: '', cancelled: false };
  for (const line of lines) {
    if (line.type === 'op') result.opId = line.op_id;
    else if (line.type === 'done') result.stage = line.stage;
    else if (line.type === 'cancelled') result.cancelled = true;
    else if (line.type === 'error') result.error = line.message;
  }
  // Tokens are the same reply the assistant/question line carries in full, so
  // they animate the pending bubble and never become one of their own.
  result.bubbles = bubblesOf(lines.filter((line) => line.type !== 'token'));
  return result;
}

/** The stage rail — the pipeline as the chat walks it, with the live one marked. */
export const STAGE_RAIL: { stage: Stage; label: string }[] = [
  { stage: 'intake', label: 'Describe' },
  { stage: 'epic', label: 'Epic' },
  { stage: 'pipeline', label: 'Build' },
  { stage: 'review', label: 'Review' },
  { stage: 'chat', label: 'Refine' },
];

/** The stages the conversation cannot leave on its own: the room asks for the
 *  next step (advanceTurn) rather than waiting for a reply nobody owes. */
export function needsAdvance(stage: Stage): boolean {
  return stage === 'pipeline' || stage === 'epic';
}

export function stageLabel(stage: Stage): string {
  if (stage === 'capacity') return 'Capacity';
  if (stage === 'spike') return 'Architecture spike';
  return STAGE_RAIL.find((step) => step.stage === stage)?.label ?? stage;
}
