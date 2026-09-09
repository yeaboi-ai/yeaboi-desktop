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
    // the one canvas the host draws has to sit in the else of an isDomStyle
    // branch. Pinning the shape rather than counting isDomStyle calls, which
    // the reach also uses.
    expect(host).toMatch(
      /isDomStyle\(scene\)[\s\S]{0,300}<ScreensaverScene[\s\S]{0,400}<ScreensaverCanvas/,
    );
    expect(host.match(/<ScreensaverCanvas/g)).toHaveLength(1);
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

  it('takes no pointer events unless the paper is being reached into', () => {
    expect(saver).toMatch(/reaching[\s\S]{0,140}pointer-events-none/);
  });

  it('turns on regardless of where the pointer is resting', () => {
    expect(saver).toContain('engageable={false}');
    expect(edition).toContain('engageable');
    expect(edition).toContain('!(engageable && engaged)');
  });

  it('holds its page while the reach is open, and only there', () => {
    // A story must not turn away from under someone deciding to click it.
    expect(saver).toContain('held={reaching}');
    expect(edition).toContain('!held');
    expect(view).toContain('held');
    expect(home).not.toContain('held=');
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

describe('preview follows selection', () => {
  const bus = read('src', 'renderer', 'lib', 'screensaver', 'preview.ts');

  it('the hover channel is gone from the bus', () => {
    expect(bus).not.toContain('hoverScreensaver');
    expect(bus).not.toContain('onHoverPreview');
    expect(host).not.toContain('onHoverPreview');
  });

  it('choosing a style shows it', () => {
    expect(section).toMatch(/setStyle\(next\)[\s\S]{0,240}previewScreensaver\(next\)/);
  });

  it('off is chosen but never previewed', () => {
    expect(section).toContain("if (next !== 'off') previewScreensaver(next)");
  });

  it('pointing at a tile still animates its own thumbnail', () => {
    // hovered survives for that alone — without it all six go static.
    expect(section).toContain('still={!hovered}');
    expect(section).toContain('setHovered(true)');
  });
});

describe('the shared view', () => {
  it('hides the refresh control when there is nobody to press it', () => {
    expect(view).toContain("onRefresh ? refreshLabel(edition) : ''");
  });
});
