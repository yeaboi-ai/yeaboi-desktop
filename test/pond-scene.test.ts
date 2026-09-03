// The pond: the geometry of the two lobes, the entrance, the duck on the
// line, the reach toward a lobe, the dive, and the three worlds.

import { describe, expect, it } from 'vitest';
import {
  DIVE_SECONDS,
  ENTRANCE_SECONDS,
  LANDING_SECONDS,
  WAVE_AMPLITUDE,
  createPondScene,
  curvePoint,
  discFor,
  heads,
  sideAt,
  type PondGeometry,
  type PondOptions,
} from '../src/renderer/lib/home/pond-scene';
import { FALLBACK_PALETTE } from '../src/renderer/lib/screensaver/palette';
import { MAX_RINGS } from '../src/renderer/lib/screensaver/rings';
import { seeded } from '../src/renderer/lib/screensaver/scene';

const GEO: PondGeometry = { cx: 140, cy: 140, r: 132, lean: 0 };

const pond = (over: Partial<PondOptions> = {}) =>
  createPondScene({
    width: 280,
    height: 560,
    palette: FALLBACK_PALETTE,
    random: seeded(7),
    world: 'solo',
    ...over,
  });

const run = (scene: ReturnType<typeof pond>, seconds: number) => {
  for (let i = 0; i < seconds * 60; i += 1) scene.step(1 / 60);
};

/** Distance from a point to the nearest sample of the resting boundary. */
const offCurve = (x: number, y: number, geo: PondGeometry): number => {
  let best = Infinity;
  for (let i = 0; i <= 400; i += 1) {
    const p = curvePoint(i / 400, geo);
    best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  }
  return best;
};

describe('the geometry', () => {
  it('runs the boundary from the top of the disc through the centre to the bottom', () => {
    expect(curvePoint(0, GEO)).toEqual({ x: 140, y: 8 });
    expect(curvePoint(0.5, GEO).x).toBeCloseTo(140);
    expect(curvePoint(0.5, GEO).y).toBeCloseTo(140);
    expect(curvePoint(1, GEO).x).toBeCloseTo(140);
    expect(curvePoint(1, GEO).y).toBeCloseTo(272);
    // Round the upper head's right, then the lower head's left.
    expect(curvePoint(0.25, GEO).x).toBeGreaterThan(140);
    expect(curvePoint(0.75, GEO).x).toBeLessThan(140);
  });

  it('keeps the boundary anchored to the disc whatever the wave', () => {
    const top = curvePoint(0, GEO, 12);
    const foot = curvePoint(1, GEO, 12);
    expect(top).toEqual(curvePoint(0, GEO));
    expect(foot.x).toBeCloseTo(curvePoint(1, GEO).x);
    expect(foot.y).toBeCloseTo(curvePoint(1, GEO).y);
    expect(curvePoint(0.5, GEO, 12).y).not.toBeCloseTo(140);
  });

  it('stays one curve when a lobe leans', () => {
    const leaning = { ...GEO, lean: 1 };
    const { upper, lower } = heads(leaning);
    expect(upper + lower).toBeCloseTo(GEO.r);
    expect(upper).toBeGreaterThan(lower);
    const fromAbove = curvePoint(0.5, leaning);
    const fromBelow = curvePoint(0.5000001, leaning);
    expect(fromAbove.x).toBeCloseTo(fromBelow.x, 3);
    expect(fromAbove.y).toBeCloseTo(fromBelow.y, 3);
  });

  it('puts the left of the disc in Projects, the right in Sessions, and the heads across', () => {
    expect(sideAt(40, 140, GEO)).toBe('projects');
    expect(sideAt(240, 140, GEO)).toBe('sessions');
    // The upper head belongs to Projects, the lower to Sessions.
    expect(sideAt(140, 74, GEO)).toBe('projects');
    expect(sideAt(140, 206, GEO)).toBe('sessions');
    expect(sideAt(0, 0, GEO)).toBeNull();
    expect(sideAt(140, 300, GEO)).toBeNull();
  });

  it('sizes the disc to the canvas, at the top', () => {
    expect(discFor(280)).toEqual({ cx: 140, cy: 140, r: 132 });
    expect(discFor(600).r).toBe(140);
  });
});

describe('the entrance', () => {
  it('finishes within its budget, with the duck landed', () => {
    const scene = pond();
    expect(scene.done()).toBe(false);
    expect(scene.mascots()[0]!.alpha).toBe(0);
    run(scene, LANDING_SECONDS + 0.05);
    expect(scene.ringCount()).toBeGreaterThan(0);
    run(scene, ENTRANCE_SECONDS - LANDING_SECONDS);
    expect(scene.done()).toBe(true);
    expect(scene.mascots()[0]!.alpha).toBe(1);
  });

  it('is already over for a still scene', () => {
    const scene = pond({ still: true });
    expect(scene.done()).toBe(true);
    const before = scene.mascots()[0]!;
    run(scene, 5);
    expect(scene.mascots()[0]).toEqual(before);
  });
});

describe('the duck on the line', () => {
  it('stays on the boundary while it paddles', () => {
    const scene = pond();
    run(scene, 2);
    for (let i = 0; i < 20 * 60; i += 1) {
      scene.step(1 / 60);
      const [duck] = scene.mascots();
      const geo = scene.geometry();
      expect(offCurve(duck!.x, duck!.y, geo)).toBeLessThanOrEqual(WAVE_AMPLITUDE * geo.r + 1);
    }
  });

  it('is deterministic for a seed', () => {
    const a = pond({ random: seeded(3) });
    const b = pond({ random: seeded(3) });
    const c = pond({ random: seeded(4) });
    run(a, 15);
    run(b, 15);
    run(c, 15);
    expect(a.mascots()).toEqual(b.mascots());
    expect(a.mascots()[0]!.x).not.toBeCloseTo(c.mascots()[0]!.x, 0);
  });

  it('never lets the rings pile up', () => {
    const scene = pond();
    for (let i = 0; i < 30; i += 1) {
      scene.dive('projects');
      run(scene, 0.05);
      expect(scene.ringCount()).toBeLessThanOrEqual(MAX_RINGS + 1);
    }
  });
});

describe('reaching for a lobe', () => {
  it('swells the lobe and pulls the duck into it, then lets go', () => {
    const scene = pond();
    run(scene, 2);
    scene.lean('projects');
    run(scene, 1.5);
    const geo = scene.geometry();
    expect(scene.leanValue()).toBeGreaterThan(0.95);
    expect(heads(geo).upper).toBeGreaterThan(heads(geo).lower);
    const [duck] = scene.mascots();
    expect(duck!.x).toBeLessThan(geo.cx - 0.3 * geo.r);
    expect(duck!.facing).toBe('left');

    scene.lean(null);
    run(scene, 2);
    expect(Math.abs(scene.leanValue())).toBeLessThan(0.05);
    expect(offCurve(scene.mascots()[0]!.x, scene.mascots()[0]!.y, scene.geometry())).toBeLessThan(
      WAVE_AMPLITUDE * geo.r + 1,
    );
  });

  it('pulls the other way for Sessions', () => {
    const scene = pond();
    run(scene, 2);
    scene.lean('sessions');
    run(scene, 1.5);
    const geo = scene.geometry();
    expect(scene.leanValue()).toBeLessThan(-0.95);
    expect(scene.mascots()[0]!.x).toBeGreaterThan(geo.cx + 0.3 * geo.r);
  });

  it('snaps rather than eases when still', () => {
    const scene = pond({ still: true });
    scene.lean('projects');
    expect(scene.leanValue()).toBe(1);
    expect(scene.mascots()[0]!.x).toBeLessThan(scene.geometry().cx);
  });
});

describe('the dive', () => {
  it('squashes the duck, bursts three rings, and recovers', () => {
    const scene = pond();
    run(scene, 2);
    run(scene, 1); // let the paddle rings fade
    const before = scene.ringCount();
    scene.dive('sessions');
    run(scene, DIVE_SECONDS / 2);
    expect(scene.mascots()[0]!.squash).toBeLessThan(0.8);
    expect(scene.ringCount()).toBe(before + 3);
    run(scene, DIVE_SECONDS);
    expect(scene.mascots()[0]!.squash).toBe(1);
  });
});

describe('the worlds', () => {
  it('draws one duck for Solo, three for Team, and the mark for Agents', () => {
    const scene = pond({ world: 'solo' });
    run(scene, 2);
    expect(scene.mascots()).toHaveLength(1);
    expect(scene.mascots()[0]!.kind).toBe('duck');

    scene.setWorld('team');
    run(scene, 2);
    const team = scene.mascots();
    expect(team).toHaveLength(3);
    expect(team[1]!.width).toBeLessThan(team[0]!.width);
    for (const follower of team.slice(1)) {
      expect(offCurve(follower.x, follower.y, scene.geometry())).toBeLessThan(
        WAVE_AMPLITUDE * scene.geometry().r + 1,
      );
    }

    scene.setWorld('agents');
    expect(scene.mascots()).toHaveLength(1);
    expect(scene.mascots()[0]!.kind).toBe('mark');
  });

  it('hops once on a world flip', () => {
    const scene = pond({ world: 'solo' });
    run(scene, 3);
    const rest = scene.mascots()[0]!.y;
    scene.setWorld('team');
    run(scene, 0.3);
    expect(scene.mascots()[0]!.y).toBeLessThan(rest - 5);
    run(scene, 1);
    expect(Math.abs(scene.mascots()[0]!.y - rest)).toBeLessThan(WAVE_AMPLITUDE * 132 * 2 + 2);
  });
});
