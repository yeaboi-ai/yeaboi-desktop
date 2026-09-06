// Four colour sources, resolved from the theme's tokens.

import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE } from '../src/renderer/lib/screensaver/palette';
import { vizPalette } from '../src/renderer/lib/music/viz/palette';

describe('vizPalette', () => {
  it('lights amber by default and the world accent on request', () => {
    expect(
      vizPalette(FALLBACK_PALETTE, { colour: 'amber', customHex: '#123456' }, false).main,
    ).toBe(FALLBACK_PALETTE.primary);
    expect(
      vizPalette(FALLBACK_PALETTE, { colour: 'accent', customHex: '#123456' }, false).main,
    ).toBe(FALLBACK_PALETTE.audienceAccent);
  });

  it('builds the spectrum ramp from two theme tokens', () => {
    const p = vizPalette(FALLBACK_PALETTE, { colour: 'spectrum', customHex: '#123456' }, false);
    expect(p.ramp).toEqual([FALLBACK_PALETTE.primary, FALLBACK_PALETTE.chart[1]]);
    expect(p.main).toBe(FALLBACK_PALETTE.primary);
  });

  it('uses the custom hex, and the tokens for the quiet states', () => {
    const p = vizPalette(FALLBACK_PALETTE, { colour: 'custom', customHex: '#22d3ee' }, false);
    expect(p.main).toBe('#22d3ee');
    expect(p.ramp).toBeNull();
    expect(p.dim).toBe(FALLBACK_PALETTE.muted);
    expect(p.floor).toBe(FALLBACK_PALETTE.border);
    expect(p.failed).toBe(FALLBACK_PALETTE.destructive);
  });

  it('glows less on a light ground', () => {
    const dark = vizPalette(FALLBACK_PALETTE, { colour: 'amber', customHex: '#000000' }, false);
    const light = vizPalette(FALLBACK_PALETTE, { colour: 'amber', customHex: '#000000' }, true);
    expect(light.glowAlpha).toBeLessThan(dark.glowAlpha);
  });
});
