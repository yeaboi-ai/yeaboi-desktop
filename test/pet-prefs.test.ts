// The duck's preference shape. settings.json is a file a human can edit, so
// every one of these asserts that a bad value produces a duck rather than a
// crash or a duck that fills the screen.

import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  PET_COLOURS,
  PET_DEFAULTS,
  PET_LIMITS,
  mergePetPrefs,
  normalizePetPrefs,
  shouldOfferPet,
} from '../src/shared/pet-prefs';

describe('PET_DEFAULTS', () => {
  it('does not dodge the cursor', () => {
    // The whole point of the setting: a duck that flees every pointer is a
    // duck nobody can click.
    expect(PET_DEFAULTS.evade).toBe(false);
  });

  it('walks, waits to be invited, and is silent only about the chime', () => {
    expect(PET_DEFAULTS.walk).toBe(true);
    // Opt-in: the duck stays in the app until asked for. See 'the desktop
    // offer' below for the rule that does the asking.
    expect(PET_DEFAULTS.enabled).toBe(false);
    expect(PET_DEFAULTS.notify).toEqual({
      os: true,
      bubble: true,
      toast: true,
      chime: false,
      chimeSound: 'marimba',
    });
  });

  it('is itself a fixed point of normalisation', () => {
    expect(normalizePetPrefs(PET_DEFAULTS)).toEqual(PET_DEFAULTS);
  });
});

describe('normalizePetPrefs', () => {
  it('fills in everything from nothing', () => {
    expect(normalizePetPrefs(undefined)).toEqual(PET_DEFAULTS);
    expect(normalizePetPrefs(null)).toEqual(PET_DEFAULTS);
    expect(normalizePetPrefs('a duck')).toEqual(PET_DEFAULTS);
  });

  it('clamps a scale that would swallow the screen', () => {
    expect(normalizePetPrefs({ scale: 40 }).scale).toBe(PET_LIMITS.scale.max);
    expect(normalizePetPrefs({ scale: 0 }).scale).toBe(PET_LIMITS.scale.min);
    expect(normalizePetPrefs({ scale: -3 }).scale).toBe(PET_LIMITS.scale.min);
  });

  it('rejects values that are not finite numbers', () => {
    expect(normalizePetPrefs({ scale: Number.NaN }).scale).toBe(PET_DEFAULTS.scale);
    // Infinity is nonsense rather than "as big as possible" — it gets the default.
    expect(normalizePetPrefs({ scale: Number.POSITIVE_INFINITY }).scale).toBe(PET_DEFAULTS.scale);
    expect(normalizePetPrefs({ scale: '2' }).scale).toBe(PET_DEFAULTS.scale);
    expect(normalizePetPrefs({ raise: null }).raise).toBe(PET_DEFAULTS.raise);
  });

  it('clamps hue, vividness and sit height to their sliders', () => {
    expect(normalizePetPrefs({ hue: 900 }).hue).toBe(PET_LIMITS.hue.max);
    expect(normalizePetPrefs({ hue: -900 }).hue).toBe(PET_LIMITS.hue.min);
    expect(normalizePetPrefs({ vividness: 12 }).vividness).toBe(PET_LIMITS.vividness.max);
    expect(normalizePetPrefs({ raise: 5000 }).raise).toBe(PET_LIMITS.raise.max);
  });

  it('takes only real booleans for the switches', () => {
    expect(normalizePetPrefs({ walk: false }).walk).toBe(false);
    expect(normalizePetPrefs({ walk: 'yes' }).walk).toBe(PET_DEFAULTS.walk);
    expect(normalizePetPrefs({ evade: true }).evade).toBe(true);
  });

  it('fills a partial notify block without losing the rest', () => {
    expect(normalizePetPrefs({ notify: { chime: true } }).notify).toEqual({
      ...PET_DEFAULTS.notify,
      chime: true,
    });
    expect(normalizePetPrefs({ notify: 'loud' }).notify).toEqual(PET_DEFAULTS.notify);
  });

  it('drops keys that are not preferences', () => {
    expect(normalizePetPrefs({ quack: true })).toEqual(PET_DEFAULTS);
  });

  it('carries the pre-prefs petEnabled forward, and only then', () => {
    // No pet block yet: the old top-level switch is the answer.
    expect(normalizePetPrefs(undefined, false).enabled).toBe(false);
    expect(normalizePetPrefs(undefined, true).enabled).toBe(true);
    // A pet block exists: it wins, so turning the duck back on sticks.
    expect(normalizePetPrefs({ enabled: true }, false).enabled).toBe(true);
    expect(normalizePetPrefs({}, false).enabled).toBe(PET_DEFAULTS.enabled);
  });
});

describe('mergePetPrefs', () => {
  it('applies a patch and re-clamps it', () => {
    const merged = mergePetPrefs(PET_DEFAULTS, { scale: 99, evade: true });
    expect(merged.scale).toBe(PET_LIMITS.scale.max);
    expect(merged.evade).toBe(true);
    expect(merged.walk).toBe(PET_DEFAULTS.walk);
  });

  it('patches one notification without clearing the others', () => {
    const merged = mergePetPrefs(PET_DEFAULTS, { notify: { os: false } });
    expect(merged.notify).toEqual({ ...PET_DEFAULTS.notify, os: false });
  });

  it('ignores a patch that is not an object', () => {
    expect(mergePetPrefs(PET_DEFAULTS, undefined)).toEqual(PET_DEFAULTS);
  });
});

describe('PET_COLOURS', () => {
  it('offers Classic as the identity tint, so a reset is visible', () => {
    const classic = PET_COLOURS.find((colour) => colour.id === 'classic');
    expect(classic).toEqual({ id: 'classic', label: 'Classic', hue: 0, vividness: 1 });
  });

  it('stays inside the sliders it shares with the hue control', () => {
    for (const colour of PET_COLOURS) {
      expect(colour.hue).toBeGreaterThanOrEqual(PET_LIMITS.hue.min);
      expect(colour.hue).toBeLessThanOrEqual(PET_LIMITS.hue.max);
      expect(colour.vividness).toBeLessThanOrEqual(PET_LIMITS.vividness.max);
    }
  });

  it('names each swatch once', () => {
    expect(new Set(PET_COLOURS.map((colour) => colour.id)).size).toBe(PET_COLOURS.length);
  });
});

// The duck is opt-in, so somebody has to be asked. The offer record is what
// keeps that from being either a nag or a one-shot the user can miss.
describe('the desktop offer', () => {
  it('starts switched off and unasked', () => {
    expect(PET_DEFAULTS.enabled).toBe(false);
    expect(PET_DEFAULTS.offer.state).toBe('unasked');
  });

  it('asks when nobody has been asked', () => {
    expect(shouldOfferPet(normalizePetPrefs({}), 0)).toBe(true);
  });

  it('never asks once the duck is already out', () => {
    const prefs = normalizePetPrefs({ enabled: true, offer: { state: 'accepted' } });
    expect(shouldOfferPet(prefs, DAY_MS * 365)).toBe(false);
  });

  it('never asks again after a refusal', () => {
    const prefs = normalizePetPrefs({ offer: { state: 'never', askedAt: 0 } });
    expect(shouldOfferPet(prefs, DAY_MS * 365)).toBe(false);
  });

  it('holds its tongue for a week after a "not now", then asks once more', () => {
    const prefs = normalizePetPrefs({ offer: { state: 'later', askedAt: 1_000 } });
    expect(shouldOfferPet(prefs, 1_000 + DAY_MS * 6)).toBe(false);
    expect(shouldOfferPet(prefs, 1_000 + DAY_MS * 8)).toBe(true);
  });

  it('treats a clock that has gone backwards as "asked just now"', () => {
    const prefs = normalizePetPrefs({ offer: { state: 'later', askedAt: DAY_MS * 100 } });
    expect(shouldOfferPet(prefs, 0)).toBe(false);
  });

  it('reads a garbage offer block as unasked rather than throwing', () => {
    for (const offer of [null, 'later', 42, { state: 'maybe' }]) {
      const prefs = normalizePetPrefs({ offer });
      expect(prefs.offer.state).toBe('unasked');
      expect(prefs.offer.askedAt).toBe(0);
    }
  });

  it('keeps a real answer whose timestamp is unreadable, and asks again', () => {
    // The answer is legible; only the clock reading is not. Zeroing it means
    // the cooling-off has trivially elapsed, so the duck asks once more —
    // better than silently treating "not now" as "never".
    const prefs = normalizePetPrefs({ offer: { state: 'later', askedAt: 'x' } });
    expect(prefs.offer).toEqual({ state: 'later', askedAt: 0 });
    expect(shouldOfferPet(prefs, DAY_MS * 30)).toBe(true);
  });

  it('carries an answer through a merge', () => {
    const answered = mergePetPrefs(normalizePetPrefs({}), {
      offer: { state: 'later', askedAt: 500 },
    });
    expect(answered.offer).toEqual({ state: 'later', askedAt: 500 });
    // A patch that says nothing about the offer must not reset it.
    expect(mergePetPrefs(answered, { scale: 1.5 }).offer).toEqual({ state: 'later', askedAt: 500 });
  });
});
