// The pond: the home's two ducks in open water, drawn on a canvas.
//
// The Projects duck and the Sessions duck share one figure of eight, a quarter
// of a lap apart, so each swims through the other's lobe and they pass at the
// crossing every lap: two opposites, one motion, which is all that is left of
// the yin-yang. Nothing is drawn but the ducks, their rings and their wakes;
// the figure shows only through where they have been.
//
// Pure. `step` never touches a canvas and `draw` never advances anything, the
// same split as the screensaver scenes, so the path and the motion are
// asserted in test/pond-scene.test.ts with no DOM. The art arrives from the
// outside for the same reason. No colour literal lives here: every colour is a
// token read off the document.

import type { Audience } from '@shared/audience';
import {
  DUCK_ASPECT,
  drawDuck,
  peekAt,
  type DuckArt,
  type OutfitLayer,
} from '@/lib/screensaver/duck-rig';
import { drawMark } from '@/lib/screensaver/mark-rig';
import type { Palette } from '@/lib/screensaver/palette';
import { drawRings, spawnRing, stepRings, type Ring } from '@/lib/screensaver/rings';
import { between, type Scene, type SceneOptions } from '@/lib/screensaver/scene';
import type { Door } from '@/lib/yeaboi/home';
import { kitFor, type Kit } from '@/lib/yeaboi/kits';

/** One lap of the whole figure. */
export const LAP_SECONDS = 16;
/** How far behind the Projects duck the Sessions duck swims, in laps. A
 *  quarter keeps one at a lobe's far end while the other is at the crossing. */
export const CHASE_LAG = 0.25;
/** The figure's half-width is at least this many times its lobe height; at
 *  that ratio the two ducks are never closer than the lobe height. */
export const MIN_ASPECT = 1.5;
export const MAX_LOBE = 140;
/** The swell under each duck, as a fraction of the lobe height. */
export const WAVE_AMPLITUDE = 1 / 24;
/** Radians per second of the swell. */
export const WAVE_RATE = 1.4;
/** The Sessions duck rides the swell higher: the ring floats. */
export const SWELL: Record<Door, number> = { projects: 1, sessions: 2 };
export const ROCK_DEGREES: Record<Door, number> = { projects: 3, sessions: 7 };
const ROCK_PERIOD = 2.8;
/** Seconds between paddle rings. */
export const RING_EVERY: Record<Door, number> = { projects: 1.6, sessions: 0.9 };
/** The Projects duck looks over its shades this often. */
export const PEEK_EVERY = 11;
/** The Sessions duck's little splash, this often. */
export const HOP_EVERY: readonly [number, number] = [5, 9];
export const HOP_SECONDS = 0.62;
export const DIVE_SECONDS = 0.32;
export const ENTRANCE_SECONDS = 1.2;
/** When the Sessions duck drops in, and how long the drop takes. */
export const DROP_AT = 0.3;
export const DROP_SECONDS = 0.45;
export const LANDING_SECONDS = DROP_AT + DROP_SECONDS;
const DROP_HEIGHT = 60;
/** The duck's width as a fraction of the lobe height. */
export const DUCK_WIDTH = 0.7;
export const FORWARD_SCALE = 1.12;
export const SOFT_ALPHA = 0.55;
export const WAKE_SECONDS = 2.5;
const WAKE_SAMPLES_PER_SECOND = 30;
const CRISP_WIDTH = 64;

export interface PondGeometry {
  cx: number;
  cy: number;
  /** Half the figure's width. */
  a: number;
  /** A lobe's height. */
  b: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The figure sized to a canvas: as wide as the ducks at the lobe ends allow,
 *  never taller than the canvas or than the width can keep apart. */
export function layout(width: number, height: number): PondGeometry {
  const b = Math.max(1, Math.min(MAX_LOBE, height * 0.42, width / (2 * MIN_ASPECT + DUCK_WIDTH)));
  const a = Math.max(b * MIN_ASPECT, width / 2 - (DUCK_WIDTH * b) / 2);
  return { cx: width / 2, cy: height / 2, a, b };
}

/** A point on the figure of eight at `t` laps: the crossing at 0, the right
 *  lobe first (its far end at 0.25), the left lobe second (its far end at
 *  0.75). The right lobe is swum anticlockwise and the left clockwise. */
export function pathPoint(t: number, geo: PondGeometry, swell = 0): Point {
  const theta = 2 * Math.PI * t;
  return {
    x: geo.cx + geo.a * Math.sin(theta),
    y: geo.cy + (geo.b / 2) * Math.sin(2 * theta) + swell,
  };
}

/** Which way the figure runs at `t`. */
export function facingAt(t: number): 'left' | 'right' {
  return Math.cos(2 * Math.PI * t) >= 0 ? 'right' : 'left';
}

export interface Mascot {
  door: Door;
  x: number;
  y: number;
  /** Drawn width in CSS px, before `scale`. */
  width: number;
  facing: 'left' | 'right';
  squash: number;
  alpha: number;
  scale: number;
  kind: 'duck' | 'mark';
  /** What it wears: the world's kit for its door. */
  kit: Kit;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

export interface PondScene extends Scene {
  /** The kits, once they load; ducks swim bare until then. */
  setOutfits(outfits: Partial<Record<Kit, OutfitLayer>> | null): void;
  /** The robo already wearing the Agents world's kits. */
  setRoboKit(kit: Partial<Record<Kit, HTMLImageElement>> | null): void;
  setWorld(world: Audience): void;
  /** Bring one duck forward and soften the other; null lets both settle. */
  forward(door: Door | null): void;
  /** The duck dives: it squashes and three rings spread. */
  dive(door: Door): void;
  /** The duck under a canvas point, the forward one first. */
  doorAt(x: number, y: number): Door | null;
  /** Whether the entrance has finished. */
  done(): boolean;
  geometry(): PondGeometry;
  /** The two ducks as drawn, the softened one first. */
  mascots(): Mascot[];
  ringCount(): number;
}

export interface PondOptions extends SceneOptions {
  world: Audience;
}

interface Duck {
  door: Door;
  facing: 'left' | 'right';
  x: number;
  y: number;
  ringIn: number;
  hopIn: number;
  hopClock: number;
  diveClock: number;
  diveRings: number;
  scale: number;
  alpha: number;
  wake: { x: number; y: number; at: number }[];
  wakeIn: number;
}

class Pond implements PondScene {
  private width: number;
  private height: number;
  private palette: Palette;
  private readonly random: () => number;
  private readonly still: boolean;
  private world: Audience;
  private geo: PondGeometry;
  private art: DuckArt | null = null;
  private outfits: Partial<Record<Kit, OutfitLayer>> | null = null;
  private roboKit: Partial<Record<Kit, HTMLImageElement>> | null = null;
  private clock = 0;
  private entrance = 0;
  private lap: number;
  private rings: Ring[] = [];
  private forwardDoor: Door | null = null;
  private landed = false;
  private readonly ducks: Record<Door, Duck>;

  constructor(options: PondOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.random = options.random;
    this.still = options.still ?? false;
    this.world = options.world;
    this.geo = layout(this.width, this.height);
    this.lap = between(this.random, 0, 1);
    this.ducks = {
      projects: this.duck('projects'),
      sessions: this.duck('sessions'),
    };
    if (this.still) {
      this.entrance = ENTRANCE_SECONDS;
      this.landed = true;
    }
    this.place();
  }

  private duck(door: Door): Duck {
    return {
      door,
      facing: 'right',
      x: 0,
      y: 0,
      ringIn: RING_EVERY[door],
      hopIn: between(this.random, HOP_EVERY[0], HOP_EVERY[1]),
      hopClock: -1,
      diveClock: -1,
      diveRings: 0,
      scale: 1,
      alpha: 1,
      wake: [],
      wakeIn: 0,
    };
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  setOutfits(outfits: Partial<Record<Kit, OutfitLayer>> | null): void {
    this.outfits = outfits;
  }

  setRoboKit(kit: Partial<Record<Kit, HTMLImageElement>> | null): void {
    this.roboKit = kit;
  }

  setWorld(world: Audience): void {
    if (world === this.world) return;
    this.world = world;
    if (this.still) return;
    for (const duck of Object.values(this.ducks)) duck.hopClock = 0;
  }

  forward(door: Door | null): void {
    this.forwardDoor = door;
    if (this.still) this.settle(true);
  }

  dive(door: Door): void {
    if (this.still) return;
    const duck = this.ducks[door];
    if (duck.diveClock >= 0) return;
    duck.diveClock = 0;
    duck.diveRings = 0;
  }

  doorAt(x: number, y: number): Door | null {
    const hit = [...this.mascots()].reverse().find((m) => {
      const w = m.width * m.scale;
      const h = w * DUCK_ASPECT;
      return Math.abs(x - m.x) <= w / 2 && Math.abs(y - m.y) <= h / 2;
    });
    return hit ? hit.door : null;
  }

  done(): boolean {
    return this.entrance >= ENTRANCE_SECONDS;
  }

  geometry(): PondGeometry {
    return this.geo;
  }

  ringCount(): number {
    return this.rings.length;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.geo = layout(width, height);
    for (const duck of Object.values(this.ducks)) duck.wake = [];
    this.place();
  }

  repalette(palette: Palette): void {
    this.palette = palette;
  }

  private lapOf(door: Door): number {
    const lag = door === 'sessions' ? CHASE_LAG : 0;
    return (((this.lap - lag) % 1) + 1) % 1;
  }

  private swell(door: Door): number {
    const phase = door === 'sessions' ? Math.PI / 2 : 0;
    return WAVE_AMPLITUDE * this.geo.b * SWELL[door] * Math.sin(WAVE_RATE * this.clock + phase);
  }

  private place(): void {
    for (const duck of Object.values(this.ducks)) {
      const t = this.lapOf(duck.door);
      const at = pathPoint(t, this.geo, this.swell(duck.door));
      duck.facing = facingAt(t);
      duck.x = at.x;
      duck.y = at.y;
    }
  }

  /** Ease each duck's size and alpha toward what `forward` asks, or snap. */
  private settle(snap: boolean, dt = 0): void {
    for (const duck of Object.values(this.ducks)) {
      const scale = this.forwardDoor === duck.door ? FORWARD_SCALE : 1;
      const alpha = this.forwardDoor && this.forwardDoor !== duck.door ? SOFT_ALPHA : 1;
      if (snap) {
        duck.scale = scale;
        duck.alpha = alpha;
        continue;
      }
      const k = Math.min(1, dt * 6);
      duck.scale += (scale - duck.scale) * k;
      duck.alpha += (alpha - duck.alpha) * k;
      if (Math.abs(duck.scale - scale) < 0.002) duck.scale = scale;
      if (Math.abs(duck.alpha - alpha) < 0.002) duck.alpha = alpha;
    }
  }

  step(dt: number): void {
    if (this.still) return;
    this.clock += dt;
    this.entrance = Math.min(ENTRANCE_SECONDS, this.entrance + dt);
    this.rings = stepRings(this.rings, dt);
    this.lap = (this.lap + dt / LAP_SECONDS) % 1;
    this.place();
    this.settle(false, dt);

    if (!this.landed && this.entrance >= LANDING_SECONDS) {
      this.landed = true;
      this.ring(this.ducks.sessions, 0.7);
    }

    for (const duck of Object.values(this.ducks)) {
      const onWater = duck.door === 'projects' || this.landed;

      if (duck.diveClock >= 0) {
        duck.diveClock += dt;
        const due = Math.min(3, Math.floor(duck.diveClock / 0.08) + 1);
        while (duck.diveRings < due) {
          duck.diveRings += 1;
          this.ring(duck, 0.5 + 0.2 * duck.diveRings);
        }
        if (duck.diveClock >= DIVE_SECONDS) duck.diveClock = -1;
      }

      if (duck.hopClock >= 0) {
        duck.hopClock += dt;
        if (duck.hopClock >= HOP_SECONDS) {
          duck.hopClock = -1;
          if (onWater) this.ring(duck, 0.45);
        }
      } else if (duck.door === 'sessions' && onWater) {
        duck.hopIn -= dt;
        if (duck.hopIn <= 0) {
          duck.hopIn = between(this.random, HOP_EVERY[0], HOP_EVERY[1]);
          duck.hopClock = 0;
        }
      }

      if (onWater) {
        duck.ringIn -= dt;
        if (duck.ringIn <= 0) {
          duck.ringIn = RING_EVERY[duck.door];
          this.ring(duck, 0.35);
        }
        duck.wakeIn -= dt;
        if (duck.wakeIn <= 0) {
          duck.wakeIn = 1 / WAKE_SAMPLES_PER_SECOND;
          duck.wake.push({ x: duck.x, y: duck.y, at: this.clock });
        }
        duck.wake = duck.wake.filter((p) => this.clock - p.at <= WAKE_SECONDS);
      }
    }
  }

  private ring(duck: Duck, size: number): void {
    const w = DUCK_WIDTH * this.geo.b;
    spawnRing(this.rings, duck.x, duck.y + w * DUCK_ASPECT * 0.3, w * size);
  }

  private squash(duck: Duck): number {
    if (duck.diveClock < 0) return 1;
    return 1 - 0.28 * Math.sin((Math.PI * duck.diveClock) / DIVE_SECONDS);
  }

  private lift(duck: Duck): number {
    const h = DUCK_WIDTH * this.geo.b * DUCK_ASPECT;
    const hop = duck.hopClock < 0 ? 0 : Math.sin((Math.PI * duck.hopClock) / HOP_SECONDS);
    if (duck.door === 'projects') return h * 0.38 * hop;
    // The Sessions duck drops in: high and hidden, then down onto the water.
    const drop = easeOut(clamp((this.entrance - DROP_AT) / DROP_SECONDS, 0, 1));
    return h * 0.38 * hop + (1 - drop) * DROP_HEIGHT;
  }

  private arrival(duck: Duck): number {
    if (duck.door === 'projects') return easeOut(clamp(this.entrance / 0.5, 0, 1));
    return this.entrance < DROP_AT ? 0 : 1;
  }

  mascots(): Mascot[] {
    const kind: Mascot['kind'] = this.world === 'agents' ? 'mark' : 'duck';
    const width = DUCK_WIDTH * this.geo.b;
    const out = Object.values(this.ducks).map((duck) => ({
      door: duck.door,
      x: duck.x,
      y: duck.y - this.lift(duck),
      width,
      facing: duck.facing,
      squash: this.squash(duck),
      alpha: duck.alpha * this.arrival(duck),
      scale: duck.scale,
      kind,
      kit: kitFor(this.world, duck.door),
    }));
    // The forward duck is drawn last, so it is drawn over the other.
    return out.sort((a, b) => a.scale - b.scale);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.strokeStyle = this.palette.audienceAccentBright;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const duck of Object.values(this.ducks)) {
      const strength = this.forwardDoor === duck.door ? 0.4 : this.forwardDoor ? 0.1 : 0.22;
      for (let i = 1; i < duck.wake.length; i += 1) {
        const from = duck.wake[i - 1]!;
        const to = duck.wake[i]!;
        ctx.globalAlpha = strength * (1 - (this.clock - to.at) / WAKE_SECONDS);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    drawRings(ctx, this.rings, this.palette.audienceAccentBright);

    for (const m of this.mascots()) {
      if (m.alpha <= 0) continue;
      const w = m.width * m.scale;
      ctx.save();
      ctx.translate(m.x, m.y);
      const pose = {
        time: this.clock,
        width: w,
        facing: m.facing,
        rotate: ROCK_DEGREES[m.door] * Math.sin((2 * Math.PI * this.clock) / ROCK_PERIOD),
        squash: m.squash,
        alpha: m.alpha,
        smooth: w < CRISP_WIDTH,
      };
      const robo = this.roboKit?.[m.kit] ?? null;
      if (m.kind === 'mark' && robo) {
        // The kit's canvas is taller than the sprite; centre the body, not the image.
        const extra = w * (robo.naturalHeight / robo.naturalWidth - DUCK_ASPECT);
        ctx.translate(0, extra / 2);
        drawMark(ctx, robo, pose);
      } else if (this.art) {
        const outfit = this.outfits?.[m.kit];
        drawDuck(ctx, outfit ? { ...this.art, outfit } : this.art, {
          ...pose,
          peek: m.door === 'projects' ? peekAt(this.clock, PEEK_EVERY) : 0,
        });
      }
      ctx.restore();
    }
  }
}

export function createPondScene(options: PondOptions): PondScene {
  return new Pond(options);
}
