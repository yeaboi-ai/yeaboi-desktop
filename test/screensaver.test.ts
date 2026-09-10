// The screensaver's clock and its physics — the two halves worth asserting.
//
// Both are deliberately free of the DOM: this repo's vitest runs in a Node
// environment, so anything that needs a canvas is out of reach here and is
// covered by running the app instead. That constraint is why the scenes split
// step() from draw() in the first place.

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { IdleController } from '../src/renderer/lib/screensaver/idle';
import { PEEK_SECONDS, peekAt } from '../src/renderer/lib/screensaver/duck-rig';
import {
  DuckYard,
  SWAY_DEGREES,
  duckCount,
} from '../src/renderer/lib/screensaver/scenes/duck-yard';
import { seeded } from '../src/renderer/lib/screensaver/scene';
import { FALLBACK_PALETTE } from '../src/renderer/lib/screensaver/palette';
import {
  DEFAULT_SAVER_STYLE,
  DRAWABLE_STYLES,
  SCENE_STYLES,
  isDomStyle,
  isSaverStyle,
  resolveScene,
} from '../src/renderer/lib/screensaver/styles';
import {
  onPreviewRequest,
  onSaverPreferenceChange,
  previewScreensaver,
  saverPreferenceChanged,
} from '../src/renderer/lib/screensaver/preview';
import {
  isSuppressed,
  onSuppressionChange,
  resetSuppression,
  suppressScreensaver,
} from '../src/renderer/lib/screensaver/suppression';

const SECOND = 1000;

describe('IdleController', () => {
  it('takes the window over only once the threshold has passed', () => {
    const idle = new IdleController(300, 0);
    expect(idle.shouldShow(299 * SECOND)).toBe(false);
    expect(idle.shouldShow(300 * SECOND)).toBe(true);
  });

  it('swallows the event that wakes it, then acts on the next', () => {
    // A keypress that both dismisses the saver and types a character is the
    // single most annoying thing a screensaver can do.
    const idle = new IdleController(5, 0);
    expect(idle.shouldShow(5 * SECOND)).toBe(true);
    expect(idle.noteActivity(5 * SECOND)).toBe(true);
    expect(idle.shouldShow(5 * SECOND)).toBe(false);
    expect(idle.noteActivity(6 * SECOND)).toBe(false);
  });

  it('does not count work as time spent away', () => {
    const idle = new IdleController(10, 0);
    idle.pushSuppression();
    expect(idle.shouldShow(1000 * SECOND)).toBe(false);
    idle.popSuppression(1000 * SECOND);
    // The clock restarts when the work finishes, so a ten-minute run does not
    // leave the saver owing ten minutes of idleness.
    expect(idle.shouldShow(1005 * SECOND)).toBe(false);
    expect(idle.shouldShow(1010 * SECOND)).toBe(true);
  });

  it('holds the saver back until the last claim is released', () => {
    const idle = new IdleController(5, 0);
    idle.pushSuppression();
    idle.pushSuppression();
    idle.popSuppression(10 * SECOND);
    expect(idle.shouldShow(100 * SECOND)).toBe(false);
    idle.popSuppression(100 * SECOND);
    expect(idle.shouldShow(105 * SECOND)).toBe(true);
  });

  it('refuses a manual preview while something is running', () => {
    const idle = new IdleController(300, 0);
    idle.pushSuppression();
    expect(idle.showNow(0)).toBe(false);
    idle.popSuppression(0);
    expect(idle.showNow(0)).toBe(true);
  });

  it('restarts the animation clock on every fresh session', () => {
    const idle = new IdleController(5, 0);
    idle.shouldShow(5 * SECOND);
    expect(idle.animationElapsed(9 * SECOND)).toBeCloseTo(4);
    idle.noteActivity(9 * SECOND);
    idle.shouldShow(14 * SECOND);
    expect(idle.animationElapsed(15 * SECOND)).toBeCloseTo(1);
  });
});

describe('suppression', () => {
  beforeEach(resetSuppression);

  it('counts claims rather than flipping a flag', () => {
    const releaseA = suppressScreensaver();
    const releaseB = suppressScreensaver();
    releaseA();
    expect(isSuppressed()).toBe(true);
    releaseB();
    expect(isSuppressed()).toBe(false);
  });

  it('ignores a release called twice', () => {
    // An effect cleanup can run more than once; the second must not cancel
    // somebody else's claim.
    const release = suppressScreensaver();
    suppressScreensaver();
    release();
    release();
    expect(isSuppressed()).toBe(true);
  });

  it('announces every change', () => {
    const seen: boolean[] = [];
    onSuppressionChange((value) => seen.push(value));
    suppressScreensaver()();
    expect(seen).toEqual([true, false]);
  });
});

describe('style resolution', () => {
  it('falls back rather than throwing on a style this build has not heard of', () => {
    // The preference is shared with a terminal and with future versions.
    expect(resolveScene('lava-lamp', () => 0)).toBe('duck-yard');
  });

  it('shuffle reaches every canvas scene', () => {
    const picked = new Set(
      SCENE_STYLES.map((_, i) => resolveScene('shuffle', () => i / SCENE_STYLES.length)),
    );
    expect(picked.size).toBe(SCENE_STYLES.length);
  });

  it('shuffle never falls off the end of the list', () => {
    expect(SCENE_STYLES).toContain(resolveScene('shuffle', () => 0.999999));
    expect(SCENE_STYLES).toContain(resolveScene('shuffle', () => 1));
  });

  it('shuffle never lands on a scene that fetches', () => {
    // It has always meant "a different one of these local canvases"; the front
    // page loads the news, which is a choice rather than a surprise.
    for (let i = 0; i <= 20; i += 1) {
      expect(resolveScene('shuffle', () => i / 20)).not.toBe('front-page');
    }
    expect(DRAWABLE_STYLES).toContain('front-page');
  });

  it('recognises off and shuffle as preferences but not as scenes', () => {
    expect(isSaverStyle('off')).toBe(true);
    expect(isSaverStyle('shuffle')).toBe(true);
    expect(isSaverStyle('lava-lamp')).toBe(false);
    expect(SCENE_STYLES).not.toContain('off');
  });

  it('the front page is a style, and deliberately not a canvas scene', () => {
    // SCENE_STYLES is what createScene is indexed by; front-page reaching it
    // would be a runtime throw rather than a wrong-looking screensaver.
    expect(isSaverStyle('front-page')).toBe(true);
    expect(SCENE_STYLES).not.toContain('front-page');
    expect(isDomStyle('front-page')).toBe(true);
    expect(isDomStyle('aurora')).toBe(false);
  });

  it('a stored front-page preference resolves to itself', () => {
    expect(resolveScene('front-page', () => 0)).toBe('front-page');
  });

  it('a style this build has never heard of still draws the default', () => {
    expect(resolveScene('lava-lamp', () => 0)).toBe(DEFAULT_SAVER_STYLE);
  });
});

function yard(seed = 3, width = 1200, height = 800): DuckYard {
  return new DuckYard({ width, height, palette: FALLBACK_PALETTE, random: seeded(seed) });
}

function run(scene: DuckYard, seconds: number): void {
  for (let i = 0; i < seconds * 60; i += 1) scene.step(1 / 60);
}

function energy(scene: DuckYard): number {
  return scene.ducks
    .filter((duck) => !duck.anchored)
    .reduce((total, duck) => total + duck.mass * (duck.vx ** 2 + duck.vy ** 2), 0);
}

describe('DuckYard', () => {
  it('is deterministic for a seed, and different for another', () => {
    const a = yard(3);
    const b = yard(3);
    const c = yard(9);
    run(a, 5);
    run(b, 5);
    run(c, 5);
    expect(a.ducks.map((d) => [d.x, d.y])).toEqual(b.ducks.map((d) => [d.x, d.y]));
    expect(a.ducks.map((d) => [d.x, d.y])).not.toEqual(c.ducks.map((d) => [d.x, d.y]));
  });

  it('never lets a duck leave the window', () => {
    const scene = yard();
    run(scene, 30);
    for (const duck of scene.ducks) {
      expect(duck.x).toBeGreaterThanOrEqual(0);
      expect(duck.y).toBeGreaterThanOrEqual(0);
      expect(duck.x).toBeLessThanOrEqual(1200);
      expect(duck.y).toBeLessThanOrEqual(800);
    }
  });

  it('holds the hero perfectly still', () => {
    const scene = yard();
    const hero = scene.ducks.find((duck) => duck.anchored)!;
    const { x, y } = hero;
    run(scene, 30);
    expect(hero.x).toBe(x);
    expect(hero.y).toBe(y);
  });

  it('does not lose energy — the yard must never settle', () => {
    // No gravity and no damping, so a yard that slows down is a bug in the
    // collision response rather than a design decision.
    const scene = yard();
    const before = energy(scene);
    run(scene, 30);
    expect(energy(scene)).toBeGreaterThan(before * 0.85);
  });

  it('spawns everyone clear of the hero', () => {
    const scene = yard();
    const hero = scene.ducks.find((duck) => duck.anchored)!;
    for (const duck of scene.ducks) {
      if (duck.anchored) continue;
      expect(Math.hypot(duck.x - hero.x, duck.y - hero.y)).toBeGreaterThanOrEqual(
        hero.radius + duck.radius,
      );
    }
  });

  it('aims the crowd through the middle', () => {
    // A yard where each duck minds its own corner never collides with anything.
    const scene = yard();
    const hero = scene.ducks.find((duck) => duck.anchored)!;
    const crossing = scene.ducks.filter((duck) => {
      if (duck.anchored) return false;
      const toward = Math.atan2(hero.y - duck.y, hero.x - duck.x);
      const heading = Math.atan2(duck.vy, duck.vx);
      const off = Math.abs(Math.atan2(Math.sin(heading - toward), Math.cos(heading - toward)));
      return off <= (66 * Math.PI) / 180;
    });
    expect(crossing.length).toBe(scene.ducks.length - 1);
  });

  it('squashes on impact and recovers', () => {
    const scene = yard();
    run(scene, 30);
    const squashed = scene.ducks.filter((duck) => duck.squishLeft > 0);
    // Over thirty seconds in a crowded yard, something has been hit.
    expect(scene.ducks.some((duck) => duck.normal !== 0 || squashed.length > 0)).toBe(true);
    run(scene, 2);
    expect(scene.ducks.every((duck) => duck.squishLeft <= 0.16)).toBe(true);
  });

  it('fills a bigger window with more ducks', () => {
    expect(duckCount(2400, 1400, 70)).toBeGreaterThan(duckCount(900, 600, 70));
  });

  it('a still scene does not move', () => {
    const scene = new DuckYard({
      width: 1200,
      height: 800,
      palette: FALLBACK_PALETTE,
      random: seeded(3),
      still: true,
    });
    const before = scene.ducks.map((duck) => [duck.x, duck.y]);
    run(scene, 10);
    expect(scene.ducks.map((duck) => [duck.x, duck.y])).toEqual(before);
  });

  it('dresses the crowd from the wardrobe, never the hero', () => {
    const scene = yard(3);
    const outfit = { image: {} as HTMLImageElement, headroom: 40, slot: 'top' as const };
    const wardrobe = [[outfit], [outfit], [outfit]];
    scene.setWardrobe(wardrobe);
    const crowd = scene.ducks.filter((duck) => !duck.anchored);
    for (const duck of crowd) {
      const worn = scene.wornBy(duck, wardrobe.length);
      expect(worn).toBeGreaterThanOrEqual(0);
      expect(worn).toBeLessThan(wardrobe.length);
    }
    // A seed decides who wears what, so a tile looks the same every time.
    expect(yard(3).ducks.map((d) => d.wear)).toEqual(scene.ducks.map((d) => d.wear));
    expect(scene.ducks.find((duck) => duck.anchored)!.wear).toBe(0);
    expect(new Set(crowd.map((d) => scene.wornBy(d, wardrobe.length))).size).toBeGreaterThan(1);
  });

  it('rebuilds the yard when the window resizes', () => {
    const scene = yard();
    run(scene, 5);
    scene.resize(600, 400);
    for (const duck of scene.ducks) {
      expect(duck.x).toBeLessThanOrEqual(600);
      expect(duck.y).toBeLessThanOrEqual(400);
    }
  });
});

describe('the duck', () => {
  it('rests, plays the gag, and rests again', () => {
    // The gag sits at the END of each period so a scene opens on the resting
    // pose rather than halfway through a look over the top.
    expect(peekAt(0, 6)).toBe(0);
    expect(peekAt(3, 6)).toBe(0);
    expect(peekAt(6 - PEEK_SECONDS / 2, 6)).toBeGreaterThan(0);
    expect(peekAt(6, 6)).toBe(0);
  });

  it('never asks for more shade-drop than the pose allows', () => {
    for (let t = 0; t < 30; t += 0.05) {
      const peek = peekAt(t, 6);
      expect(peek).toBeGreaterThanOrEqual(0);
      expect(peek).toBeLessThanOrEqual(1);
    }
  });

  it('faces the way it is travelling', () => {
    // The art is drawn looking left and the brand rig mirrors it, so `facing`
    // names a direction rather than exposing that mirror. Getting this
    // backwards points every duck the wrong way and still renders a duck,
    // which is exactly the kind of thing that ships.
    const scene = yard();
    // From the first frame, not just after something has hit it.
    for (const seconds of [0, 0.1, 5, 20]) {
      run(scene, seconds);
      for (const duck of scene.ducks) {
        if (duck.anchored || Math.abs(duck.vx) < 1) continue;
        expect(duck.facing).toBe(duck.vx < 0 ? 'left' : 'right');
      }
    }
  });

  it('rocks rather than tumbling', () => {
    // A duck head is as good upside down as any other way up; a whole duck
    // with feet is not. Past a quarter turn it stops reading as adrift and
    // starts reading as dead.
    const scene = yard();
    for (let i = 0; i < 60 * 60; i += 1) {
      scene.step(1 / 60);
      for (const duck of scene.ducks) {
        const drawn = Math.sin((duck.angle * Math.PI) / 180) * SWAY_DEGREES;
        expect(Math.abs(drawn)).toBeLessThanOrEqual(SWAY_DEGREES + 0.001);
      }
    }
  });
});

describe('the token rule', () => {
  it('no scene contains a colour literal', () => {
    // The whole promise of these screensavers is that they are drawn from the
    // active theme. A hex literal is how that promise gets broken quietly, in
    // one theme, months later — so it is a test rather than a convention.
    const dirs = [
      join(__dirname, '..', 'src', 'renderer', 'lib', 'screensaver', 'scenes'),
      join(__dirname, '..', 'src', 'renderer', 'lib', 'home'),
      // The music visualiser's painters draw from the same tokens.
      join(__dirname, '..', 'src', 'renderer', 'lib', 'music', 'viz', 'styles'),
    ];
    const files = dirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
        .map((name) => join(dir, name)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const name = file.slice(file.lastIndexOf('/') + 1);
      const source = readFileSync(file, 'utf8');
      const code = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//'))
        .join('\n');
      expect(code, `${name} hardcodes a colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code, `${name} hardcodes a colour`).not.toMatch(/\b(rgba?|hsla?)\s*\(/);
    }
  });
});

describe('the preview bus', () => {
  it('hands the listener the style it was asked for', () => {
    const seen: (string | undefined)[] = [];
    const stop = onPreviewRequest((style) => seen.push(style));
    previewScreensaver('aurora');
    stop();
    expect(seen).toEqual(['aurora']);
  });

  it('passes nothing through when no style is named, so the stored one wins', () => {
    const seen: (string | undefined)[] = [];
    const stop = onPreviewRequest((style) => seen.push(style));
    previewScreensaver();
    stop();
    expect(seen).toEqual([undefined]);
  });

  // The regression: the Preview button used to be `onClick={previewScreensaver}`,
  // which handed it a MouseEvent, and the host drew whatever style was stored
  // when the window opened rather than the tile that was clicked.
  it('resolves the style it is handed, not a default', () => {
    let drawn = '';
    const stop = onPreviewRequest((style) => {
      drawn = resolveScene(style ?? 'duck-yard', () => 0);
    });
    previewScreensaver('ricochet');
    stop();
    expect(drawn).toBe('ricochet');
  });

  it('tells listeners the stored preference moved', () => {
    let told = 0;
    const stop = onSaverPreferenceChange(() => {
      told += 1;
    });
    saverPreferenceChanged();
    saverPreferenceChanged();
    stop();
    saverPreferenceChanged();
    expect(told).toBe(2);
  });

  it('drops a listener once it unsubscribes', () => {
    let told = 0;
    const stop = onPreviewRequest(() => {
      told += 1;
    });
    stop();
    previewScreensaver('aurora');
    expect(told).toBe(0);
  });
});
