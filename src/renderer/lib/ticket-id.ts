// Friendly-id formatting and parsing. A friendly id is "<KEY>-<NUMBER>" where KEY
// is 3-10 uppercase alphanumerics starting with a letter and NUMBER is a positive int.

export interface TicketKey {
  key: string;
  number: number;
}

const FRIENDLY_ID_RE = /^([A-Z][A-Z0-9]{2,9})-(\d+)$/;

export function formatTicketKey(parts: { key: string | null | undefined; number: number | null | undefined }): string | null {
  if (!parts.key || parts.number == null) return null;
  return `${parts.key}-${parts.number}`;
}

export function parseTicketKey(input: string): TicketKey | null {
  const match = FRIENDLY_ID_RE.exec(input.trim().toUpperCase());
  if (!match) return null;
  return { key: match[1], number: Number(match[2]) };
}

export function isFriendlyId(input: string): boolean {
  return FRIENDLY_ID_RE.test(input.trim().toUpperCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(input: string): boolean {
  return UUID_RE.test(input.trim());
}

// Adaptive execution-order label rendering. Prefers the server-supplied
// exec_label; falls back to "{wave+1}" when the backend hasn't (yet) shipped
// exec_label but wave is set — handy during the post-migration window when
// some cards have been backfilled and others haven't.
export function formatExecLabel(card: {
  exec_label?: string | null;
  wave?: number | null;
}): string | null {
  if (card.exec_label) return card.exec_label;
  if (typeof card.wave === "number") return String(card.wave + 1);
  return null;
}
