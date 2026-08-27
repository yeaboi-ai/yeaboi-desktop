// The colours a scene may use: the active theme's tokens, and nothing else.
//
// ThemeProvider writes the whole token map onto <html> as inline custom
// properties, so reading the computed style of the document element picks up
// every built-in preset and any custom or org theme without the scenes knowing
// anything about themes at all. No scene may contain a colour literal — that
// is what makes a screensaver "in accordance with the theme" rather than a
// picture that happens to sit on top of one.

export interface Palette {
  background: string;
  foreground: string;
  primary: string;
  accent: string;
  muted: string;
  border: string;
  /** chart-1..8, in order — the ramp scenes colour their elements from. */
  chart: string[];
}

const CHART_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** A palette that is legible on its own, for a canvas with no document behind it. */
export const FALLBACK_PALETTE: Palette = {
  background: '#0a0a0a',
  foreground: '#f0f0f0',
  primary: '#e5a630',
  accent: '#1c1c1c',
  muted: '#858585',
  border: '#222222',
  chart: ['#e5a630', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#facc15'],
};

export function readPalette(el: HTMLElement = document.documentElement): Palette {
  const style = getComputedStyle(el);
  const token = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(`--${name}`).trim();
    return value || fallback;
  };
  const chart = CHART_KEYS.map((n, i) => token(`chart-${n}`, FALLBACK_PALETTE.chart[i]!)).filter(
    Boolean,
  );
  return {
    background: token('background', FALLBACK_PALETTE.background),
    foreground: token('foreground', FALLBACK_PALETTE.foreground),
    primary: token('primary', FALLBACK_PALETTE.primary),
    accent: token('accent', FALLBACK_PALETTE.accent),
    muted: token('muted-foreground', FALLBACK_PALETTE.muted),
    border: token('border', FALLBACK_PALETTE.border),
    chart: chart.length ? chart : FALLBACK_PALETTE.chart,
  };
}

/**
 * Watch for a theme change while the saver is up.
 *
 * A theme can be switched from another window (ThemeProvider broadcasts it), so
 * the saver must not hold the palette it started with. Returns an unsubscribe.
 */
export function onPaletteChange(handler: () => void): () => void {
  const observer = new MutationObserver(handler);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-theme', 'data-color-scheme'],
  });
  return () => observer.disconnect();
}
