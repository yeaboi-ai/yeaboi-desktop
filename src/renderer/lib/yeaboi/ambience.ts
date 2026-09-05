// The wire and the arbiter behind the shell's ambience: the duck's voice, the
// music preferences, the beta gate, the consent modal and the feedback form.
//
// DuckVoice is a port of ui/shared/_duck_voice.py, ladder and all. It is ported
// rather than shared because what crosses the wire is the vocabulary (the quip
// table, served with the preferences) and not the arbitration — one is data and
// the other is thirty lines of clock logic that a bubble in a terminal and a
// bubble in a DOM need identical copies of.

import { apiGet, apiPost } from './api';
import type { FeedbackOptions, StoredAttachment } from './feedback';
import type { MusicService } from '@shared/music-links';

export interface MusicChannel {
  name: string;
  url: string;
}

/** A streaming service as the catalogue sees it: on once its one "where it
 *  plays" choice is saved there, and that choice. */
export interface MusicServiceState {
  key: MusicService;
  label: string;
  connected: boolean;
  playback: string;
}

export interface AmbienceState {
  duck: { enabled: boolean; quips: Record<string, string> };
  // `services` arrived with the music connectors; an older sidecar omits it,
  // which reads as no service switched on.
  music: {
    channels: MusicChannel[];
    channel: number;
    enabled: boolean;
    services?: MusicServiceState[];
  };
  // `styles` is a catalogue (key -> display name) and `style` the pick, the
  // same shape music uses. `off` is the one value every surface honours.
  saver: { idle_seconds: number; style: string; styles: Record<string, string> };
  pet: { enabled: boolean };
}

export interface BetaGate {
  headline: string;
  body: string[];
  seen: boolean;
}

export interface BetaGates {
  label: string;
  subtitle: string;
  footer: string;
  gates: Record<string, BetaGate>;
}

export interface ConsentRequest {
  req_id: string;
  path: string;
  mode: string;
  context: string;
}

export type { FeedbackOptions, StoredAttachment } from './feedback';

export interface FeedbackResult {
  ok: boolean;
  via: string;
  url: string;
  message: string;
}

export interface PolishResult {
  polished: { title: string; description: string } | null;
  status: string;
}

/** One ambient event off the SSE feed, forwarded by main. */
export interface AmbientEvent {
  type: string;
  [key: string]: unknown;
}

export const getAmbience = (): Promise<AmbienceState> => apiGet('/api/ambience');

export const setAmbience = (changes: Record<string, unknown>): Promise<AmbienceState> =>
  apiPost('/api/ambience', changes);

export const getBetaGates = (): Promise<BetaGates> => apiGet('/api/beta');

export const ackBetaGate = (modeKey: string): Promise<{ seen: boolean }> =>
  apiPost(`/api/beta/${encodeURIComponent(modeKey)}/ack`);

export const getConsentRequests = (): Promise<{ requests: ConsentRequest[]; choices: string[] }> =>
  apiGet('/api/consent');

export const resolveConsent = (reqId: string, choice: string): Promise<{ granted: boolean }> =>
  apiPost(`/api/consent/${encodeURIComponent(reqId)}`, { choice });

export const getFeedbackOptions = (): Promise<FeedbackOptions> => apiGet('/api/feedback/options');

export interface FeedbackDraft {
  kind: string;
  area: string;
  title: string;
  description: string;
  /** Paths /api/feedback/attachments handed back. Any other path is refused. */
  image_paths?: string[];
  text_paths?: string[];
}

/** One screenshot or log file, base64 in JSON — the proxy sends nothing else. */
export const attachFeedbackFile = (file: {
  name: string;
  mime: string;
  data: string;
}): Promise<StoredAttachment> => apiPost('/api/feedback/attachments', file);

export const submitFeedback = (draft: FeedbackDraft): Promise<FeedbackResult> =>
  apiPost('/api/feedback', draft);

export const polishFeedback = (draft: FeedbackDraft): Promise<PolishResult> =>
  apiPost('/api/feedback/polish', draft);

// ── the beta gate ────────────────────────────────────────────────────────────

/** Which gate guards which part of the app. Sub-routes are covered: opening a
 *  ship run is entering ship, and the gate is about the mode, not the page. */
const BETA_ROOTS: ReadonlyArray<readonly [string, string]> = [
  ['/team/performance', 'performance'],
  ['/team/ship', 'ship'],
  ['/solo/review', 'weekly-review'],
  ['/agents/usage', 'agent-usage'],
  ['/agents/advisor', 'agent-advisor'],
  ['/agents/standup', 'agent-standup'],
  ['/agents/security', 'agent-security'],
];

/** The beta gate a route needs, or '' when it needs none. */
export function betaKeyFor(path: string): string {
  for (const [root, key] of BETA_ROOTS) {
    if (path === root || path.startsWith(`${root}/`)) return key;
  }
  return '';
}

// ── the duck's voice ─────────────────────────────────────────────────────────
//
// One DuckVoice for the whole app (lib/duck-voice.ts). What this module adds
// is the backend-served vocabulary: the quip table rides with the ambience
// preferences so the terminal and the desktop keep one tone.

import { duckVoice } from '../duck-voice';

/** The quip table, as served with the ambience. Seeded so a page that finishes
 *  before the first read still has something to say. */
let quips: Record<string, string> = {};

export function loadQuips(table: Record<string, string>): void {
  quips = table;
}

/**
 * Say the line for a completion event, by key.
 *
 * This is how a page tells the duck something finished: it names what happened
 * and the vocabulary decides the words, so the tone is the same everywhere and
 * a page cannot invent its own. An unknown key says nothing, which is the right
 * failure — a missing quip is not worth a wrong one.
 */
export function quip(key: string): void {
  const line = quips[key];
  if (line) duckVoice().say(line);
}
