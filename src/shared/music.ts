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

/** Where the Now Playing art comes from: Spotify's covers and YouTube's stills. */
export const ARTWORK_IMAGE_ORIGINS = ['https://i.scdn.co', 'https://i.ytimg.com'] as const;

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

// ── the visualiser ───────────────────────────────────────────────────────────

export const VIZ_STYLES = ['blocks', 'bars', 'wave', 'ink', 'rings', 'pulse'] as const;
export type VizStyleId = (typeof VIZ_STYLES)[number];

/** Where the colour comes from: the amber lamp, the world's accent, a ramp
 *  built from two theme tokens, or a hex the person picked. */
export const VIZ_COLOURS = ['amber', 'accent', 'spectrum', 'custom'] as const;
export type VizColourId = (typeof VIZ_COLOURS)[number];

export const VIZ_BAND_COUNTS = [16, 32, 64] as const;
export type VizBandCount = (typeof VIZ_BAND_COUNTS)[number];

export interface VisualizerPrefs {
  style: VizStyleId;
  colour: VizColourId;
  /** '#rrggbb', lowercase. Read only when colour is 'custom'. */
  customHex: string;
  /** Columns on the page; the pocket and popover clamp to what fits. */
  bands: VizBandCount;
  /** 0.5..2, a multiplier on every level. */
  gain: number;
  /** 0..1: how slowly the bars follow the sound. */
  smoothing: number;
  peaks: boolean;
  mirror: boolean;
  glow: boolean;
}

export const VISUALIZER_DEFAULTS: VisualizerPrefs = {
  style: 'blocks',
  colour: 'amber',
  customHex: '#e5a630',
  bands: 64,
  gain: 1,
  smoothing: 0.5,
  peaks: true,
  mirror: false,
  glow: true,
};

export const VIZ_LIMITS = { gain: [0.5, 2], smoothing: [0, 1] } as const;

export function isVizStyle(value: unknown): value is VizStyleId {
  return typeof value === 'string' && (VIZ_STYLES as readonly string[]).includes(value);
}

export function isVizColour(value: unknown): value is VizColourId {
  return typeof value === 'string' && (VIZ_COLOURS as readonly string[]).includes(value);
}

/** '#rgb' or '#rrggbb' in any case → '#rrggbb' lowercase; anything else → null. */
export function normalizeHexColour(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${hex.toLowerCase()}`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function nearestBandCount(value: unknown): VizBandCount {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  if (Number.isNaN(n)) return VISUALIZER_DEFAULTS.bands;
  let best: VizBandCount = VIZ_BAND_COUNTS[0];
  for (const count of VIZ_BAND_COUNTS) {
    if (Math.abs(count - n) < Math.abs(best - n)) best = count;
  }
  return best;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Read a stored blob into visualiser preferences that will hold. */
export function normalizeVisualizerPrefs(raw: unknown): VisualizerPrefs {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = VISUALIZER_DEFAULTS;
  return {
    style: isVizStyle(data['style']) ? data['style'] : d.style,
    colour: isVizColour(data['colour']) ? data['colour'] : d.colour,
    customHex: normalizeHexColour(data['customHex']) ?? d.customHex,
    bands: nearestBandCount(data['bands']),
    gain: clampNumber(data['gain'], d.gain, VIZ_LIMITS.gain[0], VIZ_LIMITS.gain[1]),
    smoothing: clampNumber(
      data['smoothing'],
      d.smoothing,
      VIZ_LIMITS.smoothing[0],
      VIZ_LIMITS.smoothing[1],
    ),
    peaks: flag(data['peaks'], d.peaks),
    mirror: flag(data['mirror'], d.mirror),
    glow: flag(data['glow'], d.glow),
  };
}

export interface MusicPrefs {
  /** The radio's volume, 0..1. The native apps own their own. */
  volume: number;
  /** The source tab the Music page opens on. */
  source: MusicSourceId;
  /** Pause the radio while a call or a voice session is live. */
  pauseInCalls: boolean;
  library: SavedLink[];
  /** How the radio looks while it plays: window-only, the terminal has none. */
  visualizer: VisualizerPrefs;
}

export const MUSIC_DEFAULTS: MusicPrefs = {
  volume: 0.35,
  source: 'radio',
  pauseInCalls: true,
  library: [],
  visualizer: VISUALIZER_DEFAULTS,
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
    visualizer: normalizeVisualizerPrefs(data['visualizer']),
  };
}

/** Merge a patch onto the current prefs, re-clamping whatever it touched. The
 *  visualiser block merges a level deeper, so a patch of one of its fields
 *  keeps the rest. */
export function mergeMusicPrefs(current: MusicPrefs, patch: unknown): MusicPrefs {
  const incoming = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const visualizer =
    incoming['visualizer'] && typeof incoming['visualizer'] === 'object'
      ? { ...current.visualizer, ...(incoming['visualizer'] as Record<string, unknown>) }
      : current.visualizer;
  return normalizeMusicPrefs({ ...current, ...incoming, visualizer });
}

export function newSavedLinkId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
