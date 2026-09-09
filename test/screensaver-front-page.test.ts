// The front-page screensaver's structural promises.
//
// The suite is node-only, so these are read off the source. Each one is a
// thing that would fail quietly rather than loudly: a DOM style handed to the
// canvas, a second fetcher drifting from the home page's, a paper that pauses
// on story one because the pointer is resting over the overlay.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const host = read('src', 'renderer', 'components', 'screensaver', 'screensaver-host.tsx');
const saver = read('src', 'renderer', 'components', 'screensaver', 'front-page-saver.tsx');
const section = read(
  'src',
  'renderer',
  'components',
  'settings',
  'tabs',
  'general',
  'screensaver-section.tsx',
);
const view = read('src', 'renderer', 'components', 'news', 'front-page-view.tsx');
const home = read('src', 'renderer', 'pages', 'yeaboi', 'home', 'front-page.tsx');
const edition = read('src', 'renderer', 'components', 'news', 'edition.tsx');

describe('the host', () => {
  it('never reaches the canvas without checking the style tier first', () => {
    // createScene is indexed by SCENE_STYLES and throws on anything else, so
    // every canvas the host draws has to sit in the else of an isDomStyle
    // branch. Counting the pairs survives new overlays being added; an index
    // comparison did not.
    expect(host).toContain('<ScreensaverScene');
    const branches = host.match(/isDomStyle\(/g) ?? [];
    const canvases = host.match(/<ScreensaverCanvas/g) ?? [];
    expect(canvases.length).toBeGreaterThan(0);
    expect(branches.length).toBe(canvases.length);
  });

  it('keeps the idle clock, the off switch and the preview bus untouched', () => {
    expect(host).toContain("preferenceRef.current === 'off'");
    expect(host).toContain('onPreviewRequest');
    expect(host).toContain('onSuppressionChange');
  });
});

describe('the saver', () => {
  it('reuses the paper the home page loads rather than fetching its own way', () => {
    expect(saver).toContain('loadPaper');
    expect(saver).toContain('fallbackPaper');
    expect(saver).not.toMatch(/\bapiGet\b/);
    expect(saver).not.toMatch(/\bfetch\(/);
  });

  it('renders the same view the home page renders', () => {
    expect(saver).toContain('<FrontPageView');
    expect(home).toContain('<FrontPageView');
  });

  it('does not refetch on focus — nobody is at the window', () => {
    expect(saver).not.toContain("addEventListener('focus'");
    expect(saver).not.toContain('visibilitychange');
  });

  it('swallows pointer events, so the cursor stays hidden and no story is clickable', () => {
    expect(saver).toContain('pointer-events-none');
  });

  it('turns on regardless of where the pointer is resting', () => {
    expect(saver).toContain('engageable={false}');
    expect(edition).toContain('engageable');
    expect(edition).toContain('!(engageable && engaged)');
  });

  it('never shows an error and never shows nothing', () => {
    // News off, offline, or no route at all: all three land on the notes paper.
    expect(saver).toContain('loaded.enabled !== false');
    expect(saver).toContain('<ScreensaverCanvas');
  });

  it('never turns by hand — an idle screen has nobody to turn it', () => {
    expect(saver).toContain("stored === 'hand' ? 'slow' : stored");
  });
});

describe('the picker tile', () => {
  it('is gated on the engine catalogue, so a click can never fail to save', () => {
    expect(section).toContain('ORDER.filter(offered)');
    expect(section).toContain('option in names');
  });

  it('draws a masthead rather than fetching a paper for a preview', () => {
    expect(section).toContain('MastheadTile');
    expect(section).toContain('isDomStyle(style)');
  });
});

describe('the hover preview', () => {
  const bus = read('src', 'renderer', 'lib', 'screensaver', 'preview.ts');

  it('is a signal of its own, not the idle preview', () => {
    // The idle path dismisses on any pointer movement — which is the movement
    // that starts a hover, so reusing it would flicker out instantly.
    expect(bus).toContain('hoverScreensaver');
    expect(bus).toContain('onHoverPreview');
  });

  it('draws an overlay that takes no pointer events', () => {
    // This is what keeps the tile underneath receiving the hover that
    // sustains it; without it the overlay steals the pointer and flickers.
    expect(host).toMatch(/hovered[\s\S]{0,400}pointer-events-none/);
  });

  it('never touches the idle clock', () => {
    const hoverBlock = host.slice(
      host.indexOf('onHoverPreview'),
      host.indexOf('onHoverPreview') + 400,
    );
    expect(hoverBlock).not.toContain('controller');
    expect(hoverBlock).not.toContain('showNow');
  });

  it('yields to the real screensaver', () => {
    expect(host).toContain('!showing && hovered');
  });

  it('the tile starts and ends it, and cleans up if it unmounts mid-hover', () => {
    expect(section).toContain('hoverScreensaver(style)');
    expect(section).toContain('hoverScreensaver(null)');
    expect(section).toContain('useEffect(() => () => hoverScreensaver(null), [])');
  });

  it('the keyboard reaches it too', () => {
    expect(section).toContain('onFocus={show}');
    expect(section).toContain('onBlur={hide}');
  });
});

describe('the shared view', () => {
  it('hides the refresh control when there is nobody to press it', () => {
    expect(view).toContain("onRefresh ? refreshLabel(edition) : ''");
  });
});
