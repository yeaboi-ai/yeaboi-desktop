// The pond: the home's yin-yang, drawn on a canvas.
//
// Two lobes that are opposites and make one whole. The Projects lobe is filled
// with the world's accent, because a project holds what ran inside it; the
// Sessions lobe is the page ground, because a session carries nothing in. The
// boundary between them is liquid, and the duck lives on it: the home's one
// job is that choice, so the mascot sits on the line and paddles into
// whichever side the reader reaches for.
//
// Pure. `step` never touches a canvas and `draw` never advances anything, the
// same split as the screensaver scenes, so the geometry and the motion are
// asserted in test/pond-scene.test.ts with no DOM. The art arrives from the
// outside for the same reason. No colour literal lives here: every colour is a
// token read off the document.

import type { Audience } from '@shared/audience';
import { DUCK_ASPECT, drawDuck, peekAt, type DuckArt } from '@/lib/screensaver/duck-rig';
import { drawMark } from '@/lib/screensaver/mark-rig';
import type { Palette } from '@/lib/screensaver/palette';
import { drawRings, spawnRing, stepRings, type Ring } from '@/lib/screensaver/rings';
import { between, type Scene, type SceneOptions } from '@/lib/screensaver/scene';

export type Side = 'projects' | 'sessions';

/** The disc stays this far from the canvas edge. */
export const DISC_PAD = 8;
export const MAX_RADIUS = 140;
/** The wave on the boundary, as a fraction of the radius. */
export const WAVE_AMPLITUDE = 1 / 28;
/** Radians per second the wave travels. */
export const WAVE_RATE = 1.2;
/** How far the lobes' meeting point moves when one side is reached for. */
export const LEAN_SHIFT = 1 / 12;
/** Along the boundary, in curve parameter per second. */
export const PADDLE_SPEED = 0.12;
/** Seconds between paddle rings while the duck is moving. */
export const RING_EVERY = 1.4;
/** Seconds between the duck's trips down the river, and how long one takes. */
export const EXCURSION_EVERY: readonly [number, number] = [30, 50];
export const EXCURSION_SECONDS = 9;
/** Seconds between the lead duck picking a new spot on the boundary. */
export const RETARGET_EVERY: readonly [number, number] = [6, 12];
/** Team followers trail the lead by this much curve parameter each. */
export const FOLLOWER_LAG = 0.11;
export const DIVE_SECONDS = 0.32;
export const HOP_SECONDS = 0.62;
export const ENTRANCE_SECONDS = 1.2;
/** When each mascot drops in, and how long the drop takes; the last lands
 *  inside the entrance budget. */
const ARRIVAL_START = 0.55;
const ARRIVAL_STEP = 0.15;
const ARRIVAL_SECONDS = 0.3;
/** When the lead touches the water and its landing ring spreads. */
export const LANDING_SECONDS = ARRIVAL_START + ARRIVAL_SECONDS;
/** The lead's width as a fraction of the radius; followers are smaller. */
export const DUCK_WIDTH = 0.42;
export const FOLLOWER_WIDTH = 0.32;
export const EYE_RADIUS = 1 / 7;
/** How far into a lobe the duck swims when that side is reached for. */
export const HOVER_REACH = 0.5;
/** The river starts this far below the disc, leaving room for a line of text. */
export const RIVER_GAP = 48;
const ROCK_DEGREES = 4;
/** The sprite's 2x-crisp width; anything smaller is smoothed, as the marks are. */
const CRISP_WIDTH = 64;
const PEEK_EVERY = 9;
const CURVE_SAMPLES = 72;

export interface PondGeometry {
  cx: number;
  cy: number;
  r: number;
  /** +1 swells the Projects lobe, -1 the Sessions lobe. */
  lean: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The two heads: the radii of the small circles the boundary is made of. */
export function heads(geo: PondGeometry): { upper: number; lower: number } {
  const shift = geo.r * LEAN_SHIFT * geo.lean;
  return { upper: geo.r / 2 + shift, lower: geo.r / 2 - shift };
}

/**
 * A point on the boundary. `t` runs 0 (the top of the disc) to 1 (the bottom):
 * round the upper head's right side to the centre, then round the lower head's
 * left side. `displacement` moves the point along the normal that faces the
 * Sessions lobe, tapered to nothing at both ends so the curve stays anchored
 * to the disc.
 */
export function curvePoint(t: number, geo: PondGeometry, displacement = 0): Point {
  const { upper, lower } = heads(geo);
  let px: number;
  let py: number;
  let nx: number;
  let ny: number;
  if (t <= 0.5) {
    const theta = -Math.PI / 2 + Math.PI * (t / 0.5);
    nx = Math.cos(theta);
    ny = Math.sin(theta);
    px = geo.cx + upper * nx;
    py = geo.cy - geo.r + upper + upper * ny;
  } else {
    const theta = -Math.PI / 2 - Math.PI * ((t - 0.5) / 0.5);
    const ox = Math.cos(theta);
    const oy = Math.sin(theta);
    px = geo.cx + lower * ox;
    py = geo.cy + geo.r - lower + lower * oy;
    nx = -ox;
    ny = -oy;
  }
  const d = displacement * Math.sin(Math.PI * t);
  return { x: px + nx * d, y: py + ny * d };
}

/** Which lobe a point is in, ignoring the wave; null outside the disc. */
export function sideAt(x: number, y: number, geo: PondGeometry): Side | null {
  const dx = x - geo.cx;
  const dy = y - geo.cy;
  if (dx * dx + dy * dy > geo.r * geo.r) return null;
  const { upper, lower } = heads(geo);
  const meetY = geo.cy - geo.r + 2 * upper;
  let curveX: number;
  if (y <= meetY) {
    const d = y - (geo.cy - geo.r + upper);
    curveX = geo.cx + Math.sqrt(Math.max(0, upper * upper - d * d));
  } else {
    const d = y - (geo.cy + geo.r - lower);
    curveX = geo.cx - Math.sqrt(Math.max(0, lower * lower - d * d));
  }
  return x < curveX ? 'projects' : 'sessions';
}

/** The disc for a canvas of this size: centred, at the top. */
export function discFor(width: number): { cx: number; cy: number; r: number } {
  const r = Math.max(24, Math.min(MAX_RADIUS, width / 2 - DISC_PAD));
  return { cx: width / 2, cy: DISC_PAD + r, r };
}

export interface Mascot {
  x: number;
  y: number;
  width: number;
  facing: 'left' | 'right';
  squash: number;
  alpha: number;
  kind: 'duck' | 'mark';
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (1 - Math.cos(Math.PI * p)) / 2;

export interface PondScene extends Scene {
  /** A side being reached for, or nothing. */
  lean(side: Side | null): void;
  /** The duck dives; the caller navigates once DIVE_SECONDS have passed. */
  dive(side: Side): void;
  sideAt(x: number, y: number): Side | null;
  setWorld(world: Audience): void;
  setMark(image: HTMLImageElement | null): void;
  /** Whether the entrance has finished. */
  done(): boolean;
  geometry(): PondGeometry;
  mascots(): Mascot[];
  ringCount(): number;
  leanValue(): number;
  reach(): number;
}

export interface PondOptions extends SceneOptions {
  world: Audience;
}

interface Lead {
  t: number;
  target: number;
  retargetIn: number;
  excursionIn: number;
  /** -1 when not on the river, else seconds into the trip. */
  river: number;
  toFoot: boolean;
  x: number;
  y: number;
  facing: 'left' | 'right';
  ringIn: number;
}

class Pond implements PondScene {
  private width: number;
  private height: number;
  private palette: Palette;
  private readonly random: () => number;
  private readonly still: boolean;
  private world: Audience;
  private art: DuckArt | null = null;
  private mark: HTMLImageElement | null = null;
  private clock = 0;
  private entrance: number;
  private geo: PondGeometry;
  private hoverSide: Side | null = null;
  private leanAmount = 0;
  private reachAmount = 0;
  private rings: Ring[] = [];
  private diveClock = -1;
  private diveRings = 0;
  private hopClock = -1;
  private landed = false;
  private readonly lead: Lead;

  constructor(options: PondOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.random = options.random;
    this.still = options.still ?? false;
    this.world = options.world;
    this.entrance = this.still ? ENTRANCE_SECONDS : 0;
    this.landed = this.still;
    this.geo = { ...discFor(options.width), lean: 0 };
    const start = between(this.random, 0.15, 0.4);
    const at = curvePoint(start, this.geo);
    this.lead = {
      t: start,
      target: start,
      retargetIn: between(this.random, RETARGET_EVERY[0], RETARGET_EVERY[1]),
      excursionIn: between(this.random, EXCURSION_EVERY[0], EXCURSION_EVERY[1]),
      river: -1,
      toFoot: false,
      x: at.x,
      y: at.y,
      facing: 'right',
      ringIn: RING_EVERY,
    };
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  setMark(image: HTMLImageElement | null): void {
    this.mark = image;
  }

  setWorld(world: Audience): void {
    if (world === this.world) return;
    this.world = world;
    if (!this.still) this.hopClock = 0;
  }

  lean(side: Side | null): void {
    this.hoverSide = side;
    if (this.still) {
      this.leanAmount = this.leanTarget();
      this.reachAmount = side ? 1 : 0;
      this.geo.lean = this.leanAmount;
      this.place();
    }
  }

  dive(side: Side): void {
    this.hoverSide = side;
    if (this.still) return;
    this.diveClock = 0;
    this.diveRings = 0;
  }

  sideAt(x: number, y: number): Side | null {
    return sideAt(x, y, this.geo);
  }

  done(): boolean {
    return this.entrance >= ENTRANCE_SECONDS;
  }

  geometry(): PondGeometry {
    return { ...this.geo };
  }

  leanValue(): number {
    return this.leanAmount;
  }

  reach(): number {
    return this.reachAmount;
  }

  ringCount(): number {
    return this.rings.length;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.geo = { ...discFor(width), lean: this.geo.lean };
    this.place();
  }

  repalette(palette: Palette): void {
    this.palette = palette;
  }

  private leanTarget(): number {
    return this.hoverSide === 'projects' ? 1 : this.hoverSide === 'sessions' ? -1 : 0;
  }

  private wave(t: number): number {
    return WAVE_AMPLITUDE * this.geo.r * Math.sin(2 * Math.PI * t - WAVE_RATE * this.clock);
  }

  private hasRiver(): boolean {
    return this.height > this.geo.cy + this.geo.r + RIVER_GAP + 60;
  }

  /** Where the river is at `u` (0 at its head, 1 at its foot). */
  private riverPoint(u: number): Point {
    // The duck's own half-height keeps it clear of the line of text in the gap.
    const half = this.geo.r * DUCK_WIDTH * DUCK_ASPECT * 0.5;
    const top = this.geo.cy + this.geo.r + RIVER_GAP + half;
    const bottom = this.height - DISC_PAD - half;
    const y = top + (bottom - top) * u;
    return { x: this.geo.cx + this.riverSway(y), y };
  }

  private riverSway(y: number): number {
    const top = this.geo.cy + this.geo.r + RIVER_GAP;
    const ramp = clamp((y - top) / (this.geo.r * 0.5), 0, 1);
    return (
      WAVE_AMPLITUDE *
      this.geo.r *
      ramp *
      Math.sin((2 * Math.PI * (y - top)) / (2 * this.geo.r) - WAVE_RATE * this.clock)
    );
  }

  /** The point a reached-for lobe pulls the duck toward. */
  private reachPoint(side: Side): Point {
    const dir = side === 'projects' ? -1 : 1;
    return {
      x: this.geo.cx + dir * HOVER_REACH * this.geo.r,
      y: this.geo.cy + dir * 0.05 * this.geo.r,
    };
  }

  /** Put the lead where its state says, and turn it the way it moved. */
  private place(): void {
    const lead = this.lead;
    let at: Point;
    if (lead.river >= 0) {
      const u = Math.sin((Math.PI * lead.river) / EXCURSION_SECONDS);
      at = this.riverPoint(clamp(u, 0, 1));
    } else {
      at = curvePoint(lead.t, this.geo, this.wave(lead.t));
      if (this.hoverSide && this.reachAmount > 0) {
        const to = this.reachPoint(this.hoverSide);
        const k = easeInOut(this.reachAmount);
        at = { x: at.x + (to.x - at.x) * k, y: at.y + (to.y - at.y) * k };
      }
    }
    const dx = at.x - lead.x;
    if (dx > 0.05) lead.facing = 'right';
    else if (dx < -0.05) lead.facing = 'left';
    lead.x = at.x;
    lead.y = at.y;
  }

  step(dt: number): void {
    if (this.still) return;
    this.clock += dt;
    this.entrance = Math.min(ENTRANCE_SECONDS, this.entrance + dt);
    this.rings = stepRings(this.rings, dt);

    const lean = this.leanTarget();
    this.leanAmount += (lean - this.leanAmount) * Math.min(1, dt * 6);
    this.geo.lean = this.leanAmount;
    const reach = this.hoverSide ? 1 : 0;
    this.reachAmount += (reach - this.reachAmount) * Math.min(1, dt * 5);
    if (Math.abs(this.reachAmount - reach) < 0.002) this.reachAmount = reach;

    const lead = this.lead;
    const before = { x: lead.x, y: lead.y };

    if (lead.river >= 0) {
      lead.river += dt;
      if (lead.river >= EXCURSION_SECONDS) {
        lead.river = -1;
        lead.t = 1;
        lead.target = between(this.random, 0.15, 0.85);
        lead.excursionIn = between(this.random, EXCURSION_EVERY[0], EXCURSION_EVERY[1]);
      }
    } else {
      if (!this.hoverSide) {
        lead.retargetIn -= dt;
        lead.excursionIn -= dt;
        if (lead.excursionIn <= 0 && this.hasRiver() && !lead.toFoot) {
          lead.toFoot = true;
          lead.target = 1;
        }
        if (!lead.toFoot && lead.retargetIn <= 0) {
          lead.target = between(this.random, 0.12, 0.88);
          lead.retargetIn = between(this.random, RETARGET_EVERY[0], RETARGET_EVERY[1]);
        }
      }
      const v = clamp((lead.target - lead.t) * 2.2, -PADDLE_SPEED, PADDLE_SPEED);
      lead.t = clamp(lead.t + v * dt, 0, 1);
      if (lead.toFoot && lead.t > 0.995) {
        lead.toFoot = false;
        lead.river = 0;
      }
    }

    this.place();

    if (this.diveClock >= 0) {
      this.diveClock += dt;
      const due = Math.min(3, Math.floor(this.diveClock / 0.08) + 1);
      while (this.diveRings < due) {
        this.diveRings += 1;
        this.ring(lead, DUCK_WIDTH * this.geo.r * (0.5 + 0.2 * this.diveRings));
      }
      if (this.diveClock >= DIVE_SECONDS) this.diveClock = -1;
    }
    if (this.hopClock >= 0) {
      this.hopClock += dt;
      if (this.hopClock >= HOP_SECONDS) this.hopClock = -1;
    }

    if (!this.landed && this.entrance >= LANDING_SECONDS) {
      this.landed = true;
      this.ring(lead, DUCK_WIDTH * this.geo.r * 0.6);
    }

    const moved = Math.hypot(lead.x - before.x, lead.y - before.y);
    if (this.landed && dt > 0 && moved / dt > 6) {
      lead.ringIn -= dt;
      if (lead.ringIn <= 0) {
        lead.ringIn = RING_EVERY;
        this.ring(lead, DUCK_WIDTH * this.geo.r * 0.35);
      }
    } else {
      lead.ringIn = Math.min(lead.ringIn, RING_EVERY * 0.5);
    }
  }

  private ring(lead: Lead, radius: number): void {
    const h = DUCK_WIDTH * this.geo.r * DUCK_ASPECT;
    spawnRing(this.rings, lead.x, lead.y + h * 0.3, radius);
  }

  private squash(): number {
    if (this.diveClock < 0) return 1;
    return 1 - 0.28 * Math.sin((Math.PI * this.diveClock) / DIVE_SECONDS);
  }

  private hop(): number {
    if (this.hopClock < 0) return 0;
    return Math.sin((Math.PI * this.hopClock) / HOP_SECONDS);
  }

  /** The entrance: how far in the mascot at `index` is (0 hidden, 1 landed). */
  private arrival(index: number): number {
    const start = ARRIVAL_START + index * ARRIVAL_STEP;
    return easeOut(clamp((this.entrance - start) / ARRIVAL_SECONDS, 0, 1));
  }

  mascots(): Mascot[] {
    const lead = this.lead;
    const kind = this.world === 'agents' ? 'mark' : 'duck';
    const width = DUCK_WIDTH * this.geo.r;
    const h = width * DUCK_ASPECT;
    const lift = h * 0.38 * this.hop();
    const a0 = this.arrival(0);
    const out: Mascot[] = [
      {
        x: lead.x,
        y: lead.y - lift - (1 - a0) * 40,
        width,
        facing: lead.facing,
        squash: this.squash(),
        alpha: a0,
        kind,
      },
    ];
    if (this.world !== 'team') return out;
    for (let i = 1; i <= 2; i += 1) {
      const t = clamp((lead.river >= 0 ? 1 : lead.t) - FOLLOWER_LAG * i, 0.02, 0.98);
      let at = curvePoint(t, this.geo, this.wave(t));
      if (this.hoverSide && this.reachAmount > 0 && lead.river < 0) {
        const to = this.reachPoint(this.hoverSide);
        const k = easeInOut(this.reachAmount) * 0.7;
        at = { x: at.x + (to.x - at.x) * k, y: at.y + (to.y - at.y) * k };
      }
      const a = this.arrival(i);
      out.push({
        x: at.x,
        y: at.y - lift * 0.6 - (1 - a) * 40,
        width: FOLLOWER_WIDTH * this.geo.r,
        facing: lead.facing,
        squash: 1,
        alpha: a * 0.92,
        kind,
      });
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);
    const { cx, cy, r } = this.geo;
    const { upper, lower } = heads(this.geo);
    const outline = easeOut(clamp(this.entrance / 0.5, 0, 1));
    const fill = easeOut(clamp((this.entrance - 0.3) / 0.5, 0, 1));
    const eyeUpper = { x: cx, y: cy - r + upper };
    const eyeLower = { x: cx, y: cy + r - lower };

    // The Projects lobe: the disc's left half plus the upper head, less the
    // lower head — the S-curve closes it. It fills from its eye outward.
    if (fill > 0) {
      ctx.save();
      if (fill < 1) {
        ctx.beginPath();
        ctx.arc(eyeUpper.x, eyeUpper.y, fill * 2.2 * r, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, true);
      for (let i = CURVE_SAMPLES; i >= 0; i -= 1) {
        const t = i / CURVE_SAMPLES;
        const p = curvePoint(t, this.geo, this.wave(t));
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = this.palette.audienceAccent;
      ctx.fill();

      const pulse = 1 + 0.12 * this.reachAmount * (0.5 + 0.5 * Math.sin(this.clock * 4));
      const eye = r * EYE_RADIUS;
      ctx.beginPath();
      ctx.arc(
        eyeUpper.x,
        eyeUpper.y,
        eye * (this.hoverSide === 'projects' ? pulse : 1),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = this.palette.background;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        eyeLower.x,
        eyeLower.y,
        eye * (this.hoverSide === 'sessions' ? pulse : 1),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = this.palette.audienceAccent;
      ctx.fill();
      ctx.restore();
    }

    // The outline and the boundary draw in from the top together.
    if (outline > 0) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.palette.foreground;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * outline);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.palette.audienceAccentBright;
      ctx.beginPath();
      const last = Math.round(CURVE_SAMPLES * outline);
      for (let i = 0; i <= last; i += 1) {
        const t = i / CURVE_SAMPLES;
        const p = curvePoint(t, this.geo, this.wave(t));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // The river: the boundary, continued down between the two lists.
    if (fill > 0 && this.hasRiver()) {
      ctx.save();
      ctx.globalAlpha = 0.45 * fill;
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.palette.audienceAccentBright;
      ctx.beginPath();
      const top = cy + r + RIVER_GAP;
      const bottom = this.height - DISC_PAD;
      for (let y = top; y <= bottom; y += 4) {
        const x = cx + this.riverSway(y);
        if (y === top) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawRings(ctx, this.rings, this.palette.audienceAccentBright);

    const mascots = this.mascots();
    // Followers first, so the lead is never behind them.
    for (let i = mascots.length - 1; i >= 0; i -= 1) {
      const m = mascots[i]!;
      if (m.alpha <= 0) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      const rotate = Math.sin(this.clock * 1.7 + i * 1.3) * ROCK_DEGREES;
      if (m.kind === 'mark') {
        if (this.mark) {
          drawMark(ctx, this.mark, {
            time: this.clock + i * 0.7,
            width: m.width,
            smooth: m.width < CRISP_WIDTH,
            facing: m.facing,
            rotate,
            squash: m.squash,
            alpha: m.alpha,
          });
        }
      } else if (this.art) {
        drawDuck(ctx, this.art, {
          time: this.clock + i * 0.7,
          width: m.width,
          smooth: m.width < CRISP_WIDTH,
          facing: m.facing,
          rotate,
          peek: i === 0 ? peekAt(this.clock, PEEK_EVERY) : 0,
          squash: m.squash,
          alpha: m.alpha,
        });
      }
      ctx.restore();
    }
  }
}

export function createPondScene(options: PondOptions): PondScene {
  return new Pond(options);
}
