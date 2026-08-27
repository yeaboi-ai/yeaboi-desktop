// The screensaver catalogue, and how a stored preference becomes a scene.
//
// The keys mirror yeaboi.ai's ambience.SAVER_STYLES and travel with the
// preference over GET /api/ambience. They are duplicated here rather than read
// from the payload because the app must still draw something before the
// backend is up, and because the scene modules are keyed by them.

export const SCENE_STYLES = ['duck-yard', 'constellation', 'ricochet', 'aurora'] as const;

export type SceneStyle = (typeof SCENE_STYLES)[number];

/** Everything the preference may hold, including the two that are not scenes. */
export type SaverStyle = SceneStyle | 'shuffle' | 'off';

export const DEFAULT_SAVER_STYLE: SceneStyle = 'duck-yard';

/** Fallback names, used until the backend serves its own catalogue. */
export const STYLE_NAMES: Record<SaverStyle, string> = {
  'duck-yard': 'Duck Yard',
  constellation: 'Constellation',
  ricochet: 'Ricochet',
  aurora: 'Aurora',
  shuffle: 'Shuffle',
  off: 'Off',
};

export const STYLE_BLURBS: Record<SaverStyle, string> = {
  'duck-yard': 'A yard of ducks adrift, ricocheting off each other.',
  constellation: 'A duck adrift in a field of stars.',
  ricochet: 'The duck, loose in the window, with its name in tow.',
  aurora: 'The duck at rest, under slow fields of colour.',
  shuffle: 'A different one each time.',
  off: 'Never take the window over.',
};

export function isSaverStyle(value: string): value is SaverStyle {
  return value in STYLE_NAMES;
}

/**
 * The scene to draw for a stored preference.
 *
 * `off` never reaches here — the host checks it first. An unrecognised value
 * falls back rather than throwing: the preference is shared with a terminal
 * and with future versions, and a style this build has not heard of is a
 * reason to draw the default, not to draw nothing.
 */
export function resolveScene(stored: string, pick: () => number): SceneStyle {
  if (stored === 'shuffle') {
    return SCENE_STYLES[
      Math.min(SCENE_STYLES.length - 1, Math.floor(pick() * SCENE_STYLES.length))
    ];
  }
  return (SCENE_STYLES as readonly string[]).includes(stored)
    ? (stored as SceneStyle)
    : DEFAULT_SAVER_STYLE;
}
