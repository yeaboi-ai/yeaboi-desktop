// The pond: the figure of eight, the two ducks a quarter lap apart, the
// entrance, the forward duck, the dive, and the three worlds.

import { describe, expect, it } from 'vitest';
import {
  CHASE_LAG,
  DIVE_SECONDS,
  DROP_AT,
  DUCK_WIDTH,
  ENTRANCE_SECONDS,
  FORWARD_SCALE,
  LANDING_SECONDS,
  LAP_SECONDS,
  MIN_ASPECT,
  SOFT_ALPHA,
  SWELL,
  WAVE_AMPLITUDE,
  createPondScene,
  facingAt,
  layout,
  pathPoint,
  type Mascot,
  type PondGeometry,
  type PondOptions,
} from '../src/renderer/lib/home/pond-scene';
import { FALLBACK_PALETTE } from '../src/renderer/lib/screensaver/palette';
import { MAX_RINGS } from '../src/renderer/lib/screensaver/rings';
import { seeded } from '../src/renderer/lib/screensaver/scene';

const WIDTH = 520;
const HEIGHT = 320;

const pond = (over: Partial<PondOptions> = {}) =>
  createPondScene({
    width: WIDTH,
    height: HEIGHT,
    palette: FALLBACK_PALETTE,
    random: seeded(7),
    world: 'solo',
    ...over,
  });

const run = (scene: ReturnType<typeof pond>, seconds: number) => {
  for (let i = 0; i < seconds * 60; i += 1) scene.step(1 / 60);
};

const byDoor = (scene: ReturnType<typeof pond>): Record<'projects' | 'sessions', Mascot> => {
  const [a, b] = scene.mascots();
  return a!.door === 'projects' ? { projects: a!, sessions: b! } : { projects: b!, sessions: a! };
};

/** Distance from a point to the nearest sample of the resting figure. */
const offPath = (x: number, y: number, geo: PondGeometry): number => {
  let best = Infinity;
  for (let i = 0; i <= 600; i += 1) {
    const p = pathPoint(i / 600, geo);
    best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  }
  return best;
};

describe('the figure', () => {
  const geo = layout(WIDTH, HEIGHT);

  it('sits centred, wide enough to keep the two ducks apart', () => {
    expect(geo.cx).toBe(WIDTH / 2);
    expect(geo.cy).toBe(HEIGHT / 2);
    expect(geo.a).toBeGreaterThanOrEqual(geo.b * MIN_ASPECT);
    expect(geo.b).toBeLessThanOrEqual(HEIGHT / 2);
    // The ducks at the lobe ends stay inside the canvas.
    expect(geo.cx + geo.a + (DUCK_WIDTH * geo.b) / 2).toBeLessThanOrEqual(WIDTH + 1);
  });

  it('crosses at the centre and reaches each lobe’s far end a quarter lap on', () => {
    expect(pathPoint(0, geo)).toEqual({ x: geo.cx, y: geo.cy });
    expect(pathPoint(0.5, geo).x).toBeCloseTo(geo.cx);
    expect(pathPoint(0.5, geo).y).toBeCloseTo(geo.cy);
    expect(pathPoint(0.25, geo)).toEqual({ x: geo.cx + geo.a, y: geo.cy });
    expect(pathPoint(0.75, geo).x).toBeCloseTo(geo.cx - geo.a);
    expect(pathPoint(0.75, geo).y).toBeCloseTo(geo.cy);
    // The right lobe is swum along the bottom first, the left along the bottom too:
    // one anticlockwise, one clockwise, which is what makes it an eight.
    expect(pathPoint(0.125, geo).y).toBeGreaterThan(geo.cy);
    expect(pathPoint(0.625, geo).y).toBeGreaterThan(geo.cy);
    expect(pathPoint(0.375, geo).y).toBeLessThan(geo.cy);
  });

  it('faces the way it runs', () => {
    expect(facingAt(0.1)).toBe('right');
    expect(facingAt(0.4)).toBe('left');
    expect(facingAt(0.6)).toBe('left');
    expect(facingAt(0.9)).toBe('right');
  });

  it('shrinks to a short or narrow canvas without losing the ratio', () => {
    for (const [w, h] of [
      [300, 240],
      [900, 200],
      [200, 600],
    ] as const) {
      const g = layout(w, h);
      expect(g.a).toBeGreaterThanOrEqual(g.b * MIN_ASPECT - 1e-9);
      expect(g.b).toBeGreaterThan(0);
    }
  });
});

describe('the two ducks', () => {
  it('each ride the figure within their swell, a quarter lap apart', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS);
    const geo = scene.geometry();
    for (let i = 0; i < LAP_SECONDS * 20; i += 1) {
      run(scene, 0.05);
      const { projects, sessions } = byDoor(scene);
      expect(offPath(projects.x, projects.y, geo)).toBeLessThanOrEqual(
        WAVE_AMPLITUDE * geo.b * SWELL.projects + 1,
      );
      // The Sessions duck may be mid-hop; its water line is still on the figure.
      expect(offPath(sessions.x, sessions.y, geo)).toBeLessThanOrEqual(
        WAVE_AMPLITUDE * geo.b * SWELL.sessions + DUCK_WIDTH * geo.b + 1,
      );
    }
    expect(CHASE_LAG).toBe(0.25);
  });

  it('are never closer than a lobe height, over two full laps', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS);
    const geo = scene.geometry();
    let closest = Infinity;
    for (let i = 0; i < LAP_SECONDS * 2 * 20; i += 1) {
      run(scene, 0.05);
      const { projects, sessions } = byDoor(scene);
      closest = Math.min(closest, Math.hypot(projects.x - sessions.x, projects.y - sessions.y));
    }
    expect(closest).toBeGreaterThanOrEqual(geo.b * 0.9);
    // And that gap is wider than a duck, so they pass rather than overlap.
    expect(closest).toBeGreaterThan(DUCK_WIDTH * geo.b);
  });

  it('are deterministic for a seed', () => {
    const a = pond({ random: seeded(3) });
    const b = pond({ random: seeded(3) });
    run(a, 9);
    run(b, 9);
    expect(a.mascots()).toEqual(b.mascots());
    expect(a.ringCount()).toBe(b.ringCount());
  });

  it('never fill the water with rings', () => {
    const scene = pond({ world: 'team' });
    let most = 0;
    for (let i = 0; i < 40 * 60; i += 1) {
      scene.step(1 / 60);
      if (i % 30 === 0) scene.dive(i % 60 === 0 ? 'projects' : 'sessions');
      most = Math.max(most, scene.ringCount());
    }
    expect(most).toBeLessThanOrEqual(MAX_RINGS + 1);
  });
});

describe('the entrance', () => {
  it('has the Projects duck fading in on the water and the Sessions duck dropping in', () => {
    const scene = pond();
    expect(scene.done()).toBe(false);
    const first = byDoor(scene);
    expect(first.projects.alpha).toBe(0);
    expect(first.sessions.alpha).toBe(0);

    run(scene, DROP_AT + 0.05);
    const dropping = byDoor(scene);
    const geo = scene.geometry();
    expect(dropping.projects.alpha).toBeGreaterThan(0.3);
    expect(dropping.sessions.alpha).toBe(1);
    // Still in the air: well above the figure.
    expect(offPath(dropping.sessions.x, dropping.sessions.y, geo)).toBeGreaterThan(20);
    expect(scene.ringCount()).toBe(0);

    run(scene, LANDING_SECONDS - (DROP_AT + 0.05) + 0.05);
    expect(scene.ringCount()).toBeGreaterThanOrEqual(1);
    const landed = byDoor(scene);
    expect(offPath(landed.sessions.x, landed.sessions.y, geo)).toBeLessThan(
      WAVE_AMPLITUDE * geo.b * SWELL.sessions + 2,
    );

    run(scene, ENTRANCE_SECONDS);
    expect(scene.done()).toBe(true);
    expect(byDoor(scene).projects.alpha).toBe(1);
  });

  it('is already over in a still scene, with no rings', () => {
    const scene = pond({ still: true });
    expect(scene.done()).toBe(true);
    const { projects, sessions } = byDoor(scene);
    expect(projects.alpha).toBe(1);
    expect(sessions.alpha).toBe(1);
    expect(scene.ringCount()).toBe(0);
    const before = scene.mascots();
    run(scene, 5);
    expect(scene.mascots()).toEqual(before);
  });
});

describe('forward', () => {
  it('brings one duck forward and softens the other, then lets both settle', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS);
    scene.forward('projects');
    run(scene, 2);
    const reached = byDoor(scene);
    expect(reached.projects.scale).toBeCloseTo(FORWARD_SCALE);
    expect(reached.projects.alpha).toBe(1);
    expect(reached.sessions.scale).toBe(1);
    expect(reached.sessions.alpha).toBeCloseTo(SOFT_ALPHA);
    // The forward duck is drawn last.
    expect(scene.mascots()[1]!.door).toBe('projects');

    scene.forward('sessions');
    run(scene, 2);
    expect(byDoor(scene).sessions.scale).toBeCloseTo(FORWARD_SCALE);
    expect(byDoor(scene).projects.alpha).toBeCloseTo(SOFT_ALPHA);

    scene.forward(null);
    run(scene, 2);
    const settled = byDoor(scene);
    expect(settled.projects.scale).toBe(1);
    expect(settled.sessions.scale).toBe(1);
    expect(settled.projects.alpha).toBe(1);
    expect(settled.sessions.alpha).toBe(1);
  });

  it('snaps in a still scene', () => {
    const scene = pond({ still: true });
    scene.forward('sessions');
    expect(byDoor(scene).sessions.scale).toBe(FORWARD_SCALE);
    expect(byDoor(scene).projects.alpha).toBe(SOFT_ALPHA);
    scene.forward(null);
    expect(byDoor(scene).sessions.scale).toBe(1);
  });
});

describe('the pointer', () => {
  it('finds each duck under its box and nothing in open water', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS + 1);
    const { projects, sessions } = byDoor(scene);
    expect(scene.doorAt(projects.x, projects.y)).toBe('projects');
    expect(scene.doorAt(sessions.x, sessions.y)).toBe('sessions');
    expect(scene.doorAt(2, 2)).toBeNull();
  });
});

describe('the dive', () => {
  it('squashes the duck and spreads three rings, then recovers', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS + 1);
    run(scene, 0.5);
    const before = scene.ringCount();
    scene.dive('sessions');
    run(scene, DIVE_SECONDS / 2);
    expect(byDoor(scene).sessions.squash).toBeLessThan(0.8);
    expect(byDoor(scene).projects.squash).toBe(1);
    expect(scene.ringCount()).toBeGreaterThanOrEqual(Math.min(before + 3, MAX_RINGS + 1));
    run(scene, DIVE_SECONDS);
    expect(byDoor(scene).sessions.squash).toBe(1);
  });

  it('does nothing in a still scene', () => {
    const scene = pond({ still: true });
    scene.dive('projects');
    expect(byDoor(scene).projects.squash).toBe(1);
    expect(scene.ringCount()).toBe(0);
  });
});

describe('the worlds', () => {
  it('draw feathered ducks for Solo and Team and the robo for Agents', () => {
    expect(
      pond({ world: 'solo' })
        .mascots()
        .every((m) => m.kind === 'duck'),
    ).toBe(true);
    expect(
      pond({ world: 'team' })
        .mascots()
        .every((m) => m.kind === 'duck'),
    ).toBe(true);
    expect(
      pond({ world: 'agents' })
        .mascots()
        .every((m) => m.kind === 'mark'),
    ).toBe(true);
  });

  it('keep the Projects duck and the Sessions duck in every world', () => {
    for (const world of ['solo', 'team', 'agents'] as const) {
      expect(
        pond({ world })
          .mascots()
          .map((m) => m.door)
          .sort(),
      ).toEqual(['projects', 'sessions']);
    }
  });

  it('hop once when the world flips', () => {
    const scene = pond();
    run(scene, ENTRANCE_SECONDS + 1);
    const geo = scene.geometry();
    const before = byDoor(scene);
    scene.setWorld('agents');
    run(scene, 0.3);
    const mid = byDoor(scene);
    expect(mid.projects.kind).toBe('mark');
    expect(offPath(mid.projects.x, mid.projects.y, geo)).toBeGreaterThan(8);
    run(scene, 1);
    expect(offPath(byDoor(scene).projects.x, byDoor(scene).projects.y, geo)).toBeLessThan(
      WAVE_AMPLITUDE * geo.b + 1,
    );
    expect(before.projects.kind).toBe('duck');
  });
});
