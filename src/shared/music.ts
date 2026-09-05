// Everything the desktop remembers about music, and the one function that
// turns whatever is in settings.json into preferences that will hold.
//
// Pure — no Electron import — so the clamping is testable and so the Music
// page can import the same defaults the main process writes. The radio's
// station and on/off flag are NOT here: those live behind /api/ambience so the
// terminal and the window agree on them.

import { isMusicService, parseMusicLink, type EmbedKind, type MusicService } from './music-links';

/** Hosts the four radio stations stream from (yeaboi.ai's music.CHANNELS).
 *  SomaFM bounces ice1 to its other ice hosts, so the whole domain is named. */
export const RADIO_MEDIA_ORIGINS = [
  'https://*.somafm.com',
  'https://icecast.radiofrance.fr',
] as const;

/** The three embed players the Music page may frame, and nothing else. */
export const EMBED_FRAME_ORIGINS = [
  'https://open.spotify.com',
  'https://embed.music.apple.com',
  'https://www.youtube-nocookie.com',
] as const;

/** The same hosts as webRequest URL patterns, for the header filter in main. */
export function radioUrlPatterns(origins: readonly string[] = RADIO_MEDIA_ORIGINS): string[] {
  return origins.map((origin) => `${origin}/*`);
}

/** Request headers for a radio stream, with the referrer dropped: SomaFM
 *  answers 403 to a media request that carries one it does not know, and a
 *  window's is `app://yeaboi/`. The stations need nothing else about us. */
export function radioRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'referer') continue;
    out[name] = value;
  }
  return out;
}

/** Whether `url` is on one of `origins` (a `*.` entry covers subdomains). */
export function mediaOriginAllowed(url: string, origins: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return origins.some((origin) => {
    const bare = origin.replace(/^https:\/\//, '');
    if (bare.startsWith('*.')) {
      const domain = bare.slice(2);
      return host === domain || host.endsWith(`.${domain}`);
    }
    return host === bare;
  });
}

export interface SavedLink {
  id: string;
  service: MusicService;
  kind: EmbedKind;
  /** What the row is called; the parsed label until renamed. */
  label: string;
  /** The share link as pasted. Re-parsed on every load, never trusted. */
  url: string;
  addedAt: number;
}

export type MusicSourceId = 'radio' | MusicService;

export interface MusicPrefs {
  /** The radio's volume, 0..1. The native apps own their own. */
  volume: number;
  /** The source tab the Music page opens on. */
  source: MusicSourceId;
  /** Pause the radio while a call or a voice session is live. */
  pauseInCalls: boolean;
  library: SavedLink[];
}

export const MUSIC_DEFAULTS: MusicPrefs = {
  volume: 0.35,
  source: 'radio',
  pauseInCalls: true,
  library: [],
};

export const MUSIC_LIMITS = { library: 50, label: 80, url: 500 } as const;

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function source(value: unknown): MusicSourceId {
  return value === 'radio' || isMusicService(value) ? value : MUSIC_DEFAULTS.source;
}

function savedLink(raw: unknown): SavedLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const url = typeof item['url'] === 'string' ? item['url'].trim() : '';
  if (!url || url.length > MUSIC_LIMITS.url) return null;
  const link = parseMusicLink(url);
  if (!link || (item['service'] !== undefined && item['service'] !== link.service)) return null;
  const id = typeof item['id'] === 'string' && item['id'].trim() ? item['id'].trim() : '';
  if (!id) return null;
  const label =
    typeof item['label'] === 'string' && item['label'].trim()
      ? item['label'].trim().slice(0, MUSIC_LIMITS.label)
      : link.label;
  const addedAt =
    typeof item['addedAt'] === 'number' && Number.isFinite(item['addedAt']) ? item['addedAt'] : 0;
  return { id, service: link.service, kind: link.kind, label, url, addedAt };
}

/** Read a stored blob into preferences that will hold: every field clamped,
 *  every saved link re-parsed and the rest dropped, one row per share link. */
export function normalizeMusicPrefs(raw: unknown): MusicPrefs {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const library: SavedLink[] = [];
  const seen = new Set<string>();
  const items = Array.isArray(data['library']) ? data['library'] : [];
  for (const item of items) {
    const link = savedLink(item);
    if (!link || seen.has(link.url) || seen.has(link.id)) continue;
    seen.add(link.url);
    seen.add(link.id);
    library.push(link);
    if (library.length >= MUSIC_LIMITS.library) break;
  }
  return {
    volume: clamp01(data['volume'], MUSIC_DEFAULTS.volume),
    source: source(data['source']),
    pauseInCalls: typeof data['pauseInCalls'] === 'boolean' ? data['pauseInCalls'] : true,
    library,
  };
}

/** Merge a patch onto the current prefs, re-clamping whatever it touched. */
export function mergeMusicPrefs(current: MusicPrefs, patch: unknown): MusicPrefs {
  const incoming = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  return normalizeMusicPrefs({ ...current, ...incoming });
}

export function newSavedLinkId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
