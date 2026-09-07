// Everything the desktop duck can be told to be, and the one function that
// turns whatever is in settings.json into a duck that will actually render.
//
// Pure — no Electron import — so the clamping is testable and so the settings
// tab can import the same defaults the main process writes.

/** The notification sounds, in the order they are offered. */
export const CHIMES = [
  { id: 'ding', label: 'Ding' },
  { id: 'marimba', label: 'Marimba' },
  { id: 'bell', label: 'Bell' },
  { id: 'pluck', label: 'Pluck' },
  { id: 'rise', label: 'Rise' },
  { id: 'drop', label: 'Drop' },
] as const;

export type ChimeId = (typeof CHIMES)[number]['id'];

export const DEFAULT_CHIME: ChimeId = 'marimba';

export interface PetNotifyPrefs {
  /** A native OS notification, for when the window is not in front. */
  os: boolean;
  /** The duck says it and holds a clickable bubble. */
  bubble: boolean;
  /** An in-app toast, for when you are already looking at the app. */
  toast: boolean;
  chime: boolean;
  /** Which sound it makes. */
  chimeSound: ChimeId;
}

/** Where the standing offer to let the duck out has got to.
 *  - `unasked`  — nobody has been asked yet
 *  - `later`    — "not now"; ask again once the cooling-off has passed
 *  - `never`    — dismissed for good
 *  - `accepted` — the duck is out, or has been */
export type PetOfferState = 'unasked' | 'later' | 'never' | 'accepted';

export interface PetOffer {
  state: PetOfferState;
  /** When the question was last put, in epoch ms. 0 while `unasked`. */
  askedAt: number;
}

export interface PetPrefs {
  enabled: boolean;
  /** The standing offer to let the duck out onto the desktop. */
  offer: PetOffer;
  /** 1 is the 72px rig the duck shipped with. */
  scale: number;
  /** Degrees of hue rotation applied to the sprite art. */
  hue: number;
  /** Saturation multiplier; 0 is a greyscale duck. */
  vividness: number;
  /** How far above the surface under him the feet sit — the tray's Sit
   *  higher/lower. Zero means standing on it, which is where a duck goes
   *  unless somebody asks for otherwise: with the Dock hidden there is nothing
   *  beneath him to clear, and any lift reads as floating. */
  raise: number;
  /** Wander along the floor, rather than standing where it was put. */
  walk: boolean;
  /** Flee an approaching cursor. Off by default: a duck that dodges every
   *  pointer is a duck nobody can click. */
  evade: boolean;
  notify: PetNotifyPrefs;
}

export const PET_LIMITS = {
  scale: { min: 0.6, max: 2, step: 0.05 },
  hue: { min: -180, max: 180, step: 1 },
  vividness: { min: 0, max: 1.6, step: 0.05 },
  raise: { min: 0, max: 80, step: 2 },
} as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a "not now" holds. Long enough not to nag, short enough that
 *  somebody who was busy the first time still finds the duck. */
export const PET_OFFER_COOLDOWN_MS = 7 * DAY_MS;

const OFFER_STATES: readonly PetOfferState[] = ['unasked', 'later', 'never', 'accepted'];

export const PET_DEFAULTS: PetPrefs = {
  // The duck stays in the app until somebody asks for him. He offers; he does
  // not simply appear on a desktop nobody invited him to.
  enabled: false,
  offer: { state: 'unasked', askedAt: 0 },
  scale: 1,
  hue: 0,
  vividness: 1,
  raise: 0,
  walk: true,
  evade: false,
  notify: { os: true, bubble: true, toast: true, chime: false, chimeSound: DEFAULT_CHIME },
};

/** Named hues, so a duck can be recoloured without aiming a slider. */
export const PET_COLOURS: readonly { id: string; label: string; hue: number; vividness: number }[] =
  [
    { id: 'classic', label: 'Classic', hue: 0, vividness: 1 },
    { id: 'sunset', label: 'Sunset', hue: 40, vividness: 1.15 },
    { id: 'berry', label: 'Berry', hue: 140, vividness: 1.1 },
    { id: 'ice', label: 'Ice', hue: -170, vividness: 0.9 },
    { id: 'mint', label: 'Mint', hue: -60, vividness: 1 },
    { id: 'mono', label: 'Mono', hue: 0, vividness: 0 },
  ];

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** An unrecognised offer block reads as unasked. Erring towards asking is the
 *  safe direction: the worst case is one question, and the alternative is a
 *  feature nobody is ever told about. */
function normalizeOffer(raw: unknown): PetOffer {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const state = source['state'];
  if (typeof state !== 'string' || !OFFER_STATES.includes(state as PetOfferState)) {
    return { ...PET_DEFAULTS.offer };
  }
  const askedAt = source['askedAt'];
  return {
    state: state as PetOfferState,
    askedAt: typeof askedAt === 'number' && Number.isFinite(askedAt) ? askedAt : 0,
  };
}

/**
 * Should the duck put the question now?
 *
 * Once for somebody who has never been asked, once more a week after a "not
 * now", and never after a refusal or an acceptance. `now` is a parameter so the
 * rule is a pure function of the record rather than of the wall clock.
 *
 * A `now` earlier than `askedAt` — a clock that moved backwards, or a settings
 * file carried to another machine — counts as no time passed, so a corrected
 * clock cannot turn into a question the user just answered.
 */
export function shouldOfferPet(prefs: PetPrefs, now: number): boolean {
  const { state, askedAt } = prefs.offer;
  if (state === 'never' || state === 'accepted') return false;
  if (prefs.enabled) return false;
  if (state === 'unasked') return true;
  return now - askedAt >= PET_OFFER_COOLDOWN_MS;
}

/**
 * Read a stored blob into a duck that will render.
 *
 * Every field is clamped rather than trusted: settings.json is a plain file a
 * human can edit, and a NaN width or a scale of 40 is a duck that fills the
 * screen with no way back to the setting that did it. `legacyEnabled` carries
 * the pre-prefs top-level `petEnabled` forward when no `pet` block exists yet.
 */
export function normalizePetPrefs(raw: unknown, legacyEnabled?: unknown): PetPrefs {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hasBlock = raw !== null && typeof raw === 'object';
  const notify = (
    source['notify'] && typeof source['notify'] === 'object' ? source['notify'] : {}
  ) as Record<string, unknown>;
  const { scale, hue, vividness, raise } = PET_LIMITS;
  return {
    enabled: bool(
      source['enabled'],
      hasBlock ? PET_DEFAULTS.enabled : bool(legacyEnabled, PET_DEFAULTS.enabled),
    ),
    offer: normalizeOffer(source['offer']),
    scale: clamp(source['scale'], PET_DEFAULTS.scale, scale.min, scale.max),
    hue: clamp(source['hue'], PET_DEFAULTS.hue, hue.min, hue.max),
    vividness: clamp(source['vividness'], PET_DEFAULTS.vividness, vividness.min, vividness.max),
    raise: clamp(source['raise'], PET_DEFAULTS.raise, raise.min, raise.max),
    walk: bool(source['walk'], PET_DEFAULTS.walk),
    evade: bool(source['evade'], PET_DEFAULTS.evade),
    notify: {
      os: bool(notify['os'], PET_DEFAULTS.notify.os),
      bubble: bool(notify['bubble'], PET_DEFAULTS.notify.bubble),
      toast: bool(notify['toast'], PET_DEFAULTS.notify.toast),
      chime: bool(notify['chime'], PET_DEFAULTS.notify.chime),
      chimeSound: CHIMES.some((one) => one.id === notify['chimeSound'])
        ? (notify['chimeSound'] as ChimeId)
        : PET_DEFAULTS.notify.chimeSound,
    },
  };
}

/** Merge a patch onto the current prefs, re-clamping whatever it touched. */
export function mergePetPrefs(current: PetPrefs, patch: unknown): PetPrefs {
  const incoming = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const notify = (
    incoming['notify'] && typeof incoming['notify'] === 'object' ? incoming['notify'] : {}
  ) as Record<string, unknown>;
  const offer = (
    incoming['offer'] && typeof incoming['offer'] === 'object' ? incoming['offer'] : {}
  ) as Record<string, unknown>;
  return normalizePetPrefs({
    ...current,
    ...incoming,
    notify: { ...current.notify, ...notify },
    offer: { ...current.offer, ...offer },
  });
}
