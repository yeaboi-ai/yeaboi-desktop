// What a connection's chip says, and why.
//
// Two facts arrive from the wire and they answer different questions:
// `is_set`/`connected` says the credentials are PRESENT, `status` says what
// the last live probe FOUND. Painting the first as the second is what let a
// dummy ElevenLabs key read as connected.
//
// A sidecar that predates the status key sends nothing, which reads as
// untested — the honest answer for a build that cannot know.

import { terseAge } from '../relative-time';

export type ConnectionOutcome = 'untested' | 'ok' | 'failed';

export interface ConnectionStatus {
  outcome: ConnectionOutcome;
  message: string;
  /** ISO-8601 UTC; '' when never probed. */
  checked_at: string;
}

export type ConnectionChipState = 'unset' | 'untested' | 'ok' | 'failed';

export interface ChipCopy {
  state: ConnectionChipState;
  label: string;
  /** The full message, for a title attribute — a failure reason can be long. */
  detail: string;
  tone: 'muted' | 'success' | 'destructive';
}

/**
 * The chip for one connection.
 *
 * `configured` is presence. `status` is the probe. Neither alone is the
 * answer: a present-but-unprobed key is "saved", not "connected", and a
 * verified one carries when it was verified, because that is a fact about the
 * past rather than live health.
 */
export function resolveStatus(
  input: { configured: boolean; status?: ConnectionStatus },
  now: Date = new Date(),
): ChipCopy {
  const { configured, status } = input;
  if (!configured) {
    return { state: 'unset', label: 'not connected', detail: '', tone: 'muted' };
  }
  if (!status || status.outcome === 'untested') {
    return {
      state: 'untested',
      label: 'key saved · not tested',
      detail: 'Saved, but nothing has checked it with the vendor yet.',
      tone: 'muted',
    };
  }
  if (status.outcome === 'failed') {
    const reason = status.message.trim() || 'invalid key';
    return { state: 'failed', label: reason, detail: reason, tone: 'destructive' };
  }
  const age = terseAge(status.checked_at, now);
  return {
    state: 'ok',
    label: age ? `connected · verified ${age}` : 'connected',
    detail: status.message.trim() || 'Verified with the vendor.',
    tone: 'success',
  };
}

/** The status for one kind out of the settings snapshot's map. */
export function statusFor(
  connections: Record<string, ConnectionStatus> | undefined,
  kind: string,
): ConnectionStatus | undefined {
  if (!connections || !kind) return undefined;
  return connections[kind];
}
