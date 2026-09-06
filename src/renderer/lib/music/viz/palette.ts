// The colours a painter may use, resolved once from the theme's tokens and the
// person's choice. No painter reads a token itself, and none holds a literal.

import type { Palette } from '@/lib/screensaver/palette';
import type { VisualizerPrefs } from '@shared/music';

export interface VizPalette {
  /** The lit colour. */
  main: string;
  /** Paused. */
  dim: string;
  /** Off: the floor every style rests on. */
  floor: string;
  failed: string;
  /** Low → high, for the spectrum ramp; null for one colour. */
  ramp: [string, string] | null;
  /** The main colour's alpha behind a glow. */
  glowAlpha: number;
  light: boolean;
  background: string;
}

export function vizPalette(
  tokens: Palette,
  prefs: Pick<VisualizerPrefs, 'colour' | 'customHex'>,
  light: boolean,
): VizPalette {
  let main = tokens.primary;
  let ramp: [string, string] | null = null;
  if (prefs.colour === 'accent') main = tokens.audienceAccent;
  else if (prefs.colour === 'custom') main = prefs.customHex;
  else if (prefs.colour === 'spectrum') ramp = [tokens.primary, tokens.chart[1] ?? tokens.primary];
  return {
    main,
    dim: tokens.muted,
    floor: tokens.border,
    failed: tokens.destructive,
    ramp,
    glowAlpha: light ? 0.25 : 0.55,
    light,
    background: tokens.background,
  };
}
