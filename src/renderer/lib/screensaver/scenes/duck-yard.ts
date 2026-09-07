// A yard of ducks: the terminal screensaver, on a canvas.
//
// A port of yeaboi.ai's src/yeaboi/ui/shared/_mayhem.py. The physics is carried
// over whole — no gravity, perfectly elastic bounces, spin traded on contact,
// squash-and-stretch along the impact normal, an anchored hero in the middle
// that everything ricochets off. What does not come over is the machinery that
// existed only because the terminal cannot rotate anything: the 48-angle by
// 5-squash by 16-normal table of pre-rotated sprite grids is one ctx.rotate
// here, so it is simply gone.
//
// The ducks are the real duck — the three-layer brand rig, green body, orange
// bill and sunglasses, flapping as it tumbles. The theme owns everything
// around them: the ground, the halo behind the anchored hero, and the ring
// that opens where two of them collide. A mascot recoloured to match a palette
// is not a mascot, so the duck keeps its own colours and the room changes
// around it.

import { drawDuck, peekAt, type DuckArt, type OutfitLayer } from '../duck-rig';
import { isLightGround } from '../luminance';
import type { Palette } from '../palette';
import { drawRings, spawnRing, stepRings, type Ring } from '../rings';
import { between, type Scene, type SceneOptions } from '../scene';

// Tuning. Speeds and distances are in duck-widths per second and duck-widths,
// so the yard reads the same on a laptop panel and an external display.
const DRIFT_SPEED = [0.5, 0.95] as const;
// Rock, do not tumble. The terminal's yard threw duck *heads* around, and a
// head is as good upside down as any other way up. A whole duck with feet is
// not: past about a quarter turn it stops reading as adrift and starts reading
// as dead. So the angle drives a sway rather than a rotation.
const SPIN_SPEED = [-75, 75] as const; // degrees/second, of sway phase
export const SWAY_DEGREES = 16;
const CROSSING_SPREAD = (65 * Math.PI) / 180; // aim at the middle, ± this
const BOUNCE = 1; // perfectly elastic: the yard must not settle
const HERO_SCALE = 2;
const SQUISH_SECONDS = 0.16;
const SQUISH_CURVE = [0.8, 0.87, 0.93, 0.97] as const;
const RADIUS_OF_SIZE = 0.42; // the silhouette is not a full circle
const COVERAGE = 0.1; // fraction of the window the crowd's discs cover
const DUCK_MIN = 4;
const DUCK_MAX = 30;
/** How often the anchored hero looks over the top of his shades. */
const HERO_PEEK_EVERY = 6;
const STEP = 1 / 120; // fixed timestep, so the sim is frame-rate independent
const MAX_CATCH_UP = 0.5; // seconds of simulation per frame, at most

interface Duck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // degrees
  spin: number; // degrees/second
  radius: number;
  mass: number;
  anchored: boolean;
  /** Offsets the wing flap so twenty ducks do not beat as one. */
  phase: number;
  facing: 'left' | 'right';
  /** Seconds left of the squash, and the world-space normal it happened along. */
  squishLeft: number;
  normal: number; // radians
  /** Which of the wardrobe's personas this duck wears, as a fraction of the list. */
  wear: number;
}

/** How many ducks a window of this size holds. */
export function duckCount(width: number, height: number, size: number): number {
  const heroArea = Math.PI * (size * HERO_SCALE * RADIUS_OF_SIZE) ** 2;
  const each = Math.PI * (size * RADIUS_OF_SIZE) ** 2;
  return Math.max(
    DUCK_MIN,
    Math.min(DUCK_MAX, Math.floor((width * height * COVERAGE - heroArea) / each)),
  );
}

/**
 * The drawn size of one duck for a window.
 *
 * Ducks grow with the window but stop well before it does, so a large display
 * gets a fuller yard rather than the same yard scaled up — which is the whole
 * difference between a crowd and a wallpaper.
 */
export function duckSize(width: number, height: number): number {
  return Math.max(40, Math.min(96, Math.round(Math.min(width, height) / 9)));
}

export class DuckYard implements Scene {
  ducks: Duck[] = [];
  private width: number;
  private height: number;
  private palette: Palette;
  private random: () => number;
  private still: boolean;
  private size = 0;
  private carry = 0;
  private clock = 0;
  private rings: Ring[] = [];
  private art: DuckArt | null = null;
  private wardrobe: readonly (readonly OutfitLayer[])[] | null = null;
  private light = false;

  constructor(options: SceneOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.random = options.random;
    this.still = options.still ?? false;
    this.light = isLightGround(this.palette.background);
    this.populate();
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  /** Every persona's layers: the crowd wears a mix of them. The hero wears
   *  whatever the art itself wears. Null undresses the crowd. */
  setWardrobe(wardrobe: readonly (readonly OutfitLayer[])[] | null): void {
    this.wardrobe = wardrobe && wardrobe.length > 0 ? wardrobe : null;
  }

  /** The wardrobe index a crowd duck draws from, for a wardrobe of `count`. */
  wornBy(duck: Duck, count: number): number {
    return Math.min(count - 1, Math.floor(duck.wear * count));
  }

  private populate(): void {
    this.size = duckSize(this.width, this.height);
    const radius = this.size * RADIUS_OF_SIZE;
    const hero: Duck = {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      radius: radius * HERO_SCALE,
      mass: Number.POSITIVE_INFINITY,
      anchored: true,
      phase: 0,
      facing: 'right',
      squishLeft: 0,
      normal: 0,
      wear: 0,
    };
    const ducks = [hero];

    // Stratified placement: one duck per coarse grid cell, jittered, and any
    // that lands on the hero is dropped. Uniform sampling clumps, and a clump
    // reads as a bug rather than as a crowd.
    const wanted = duckCount(this.width, this.height, this.size);
    const cols = Math.max(1, Math.ceil(Math.sqrt(wanted * (this.width / this.height))));
    const rows = Math.max(1, Math.ceil(wanted / cols));
    const cellW = this.width / cols;
    const cellH = this.height / rows;
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) cells.push([c, r]);
    // Shuffle so a partial fill is not biased to the top-left.
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }

    for (const [c, r] of cells) {
      if (ducks.length - 1 >= wanted) break;
      const x = Math.max(
        radius,
        Math.min(this.width - radius, (c + between(this.random, 0.2, 0.8)) * cellW),
      );
      const y = Math.max(
        radius,
        Math.min(this.height - radius, (r + between(this.random, 0.2, 0.8)) * cellH),
      );
      if (Math.hypot(x - hero.x, y - hero.y) < hero.radius + radius * 1.6) continue;
      // Everyone crosses the middle, give or take — a yard where each duck
      // minds its own corner never collides with anything.
      const toward = Math.atan2(hero.y - y, hero.x - x);
      const heading = toward + between(this.random, -CROSSING_SPREAD, CROSSING_SPREAD);
      const speed = between(this.random, DRIFT_SPEED[0], DRIFT_SPEED[1]) * this.size;
      ducks.push({
        x,
        y,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        angle: between(this.random, 0, 360),
        spin: between(this.random, SPIN_SPEED[0], SPIN_SPEED[1]),
        radius,
        mass: radius * radius,
        anchored: false,
        phase: between(this.random, 0, 4),
        facing: Math.cos(heading) < 0 ? 'left' : 'right',
        squishLeft: 0,
        normal: 0,
        wear: this.random(),
      });
    }
    this.ducks = ducks;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.populate();
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  repalette(palette: Palette): void {
    // Only the room changes colour; the ducks never do.
    this.palette = palette;
    this.light = isLightGround(palette.background);
  }

  step(dt: number): void {
    if (this.still) return;
    this.clock += dt;
    this.rings = stepRings(this.rings, dt);
    this.carry = Math.min(this.carry + dt, MAX_CATCH_UP);
    while (this.carry >= STEP) {
      this.advance(STEP);
      this.carry -= STEP;
    }
  }

  private advance(dt: number): void {
    for (const duck of this.ducks) {
      if (duck.squishLeft > 0) duck.squishLeft = Math.max(0, duck.squishLeft - dt);
      if (duck.anchored) continue;
      duck.x += duck.vx * dt;
      duck.y += duck.vy * dt;
      duck.angle += duck.spin * dt;
      // Facing follows velocity every step. Turning only on impact leaves a
      // duck moon-walking until something happens to hit it.
      if (Math.abs(duck.vx) > 1) duck.facing = duck.vx < 0 ? 'left' : 'right';
      // Walls clamp on the drawn half-size, not the collision radius, so a duck
      // caught mid-rotation never has a corner sheared off by the edge.
      const half = this.size * 0.5 * (duck.radius / (this.size * RADIUS_OF_SIZE));
      if (duck.x < half) {
        duck.x = half;
        duck.vx = Math.abs(duck.vx);
        this.hit(duck, 0);
      } else if (duck.x > this.width - half) {
        duck.x = this.width - half;
        duck.vx = -Math.abs(duck.vx);
        this.hit(duck, Math.PI);
      }
      if (duck.y < half) {
        duck.y = half;
        duck.vy = Math.abs(duck.vy);
        this.hit(duck, Math.PI / 2);
      } else if (duck.y > this.height - half) {
        duck.y = this.height - half;
        duck.vy = -Math.abs(duck.vy);
        this.hit(duck, -Math.PI / 2);
      }
    }
    this.collide();
  }

  /** Resolve every overlap after all motion, so the result is order-independent. */
  private collide(): void {
    for (let i = 0; i < this.ducks.length; i += 1) {
      for (let j = i + 1; j < this.ducks.length; j += 1) {
        const a = this.ducks[i]!;
        const b = this.ducks[j]!;
        if (a.anchored && b.anchored) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const touching = a.radius + b.radius;
        if (dist === 0 || dist >= touching) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const avn = a.vx * nx + a.vy * ny;
        const bvn = b.vx * nx + b.vy * ny;

        // Separate first, by inverse mass, so nothing stays interpenetrated and
        // re-collides every frame.
        const overlap = touching - dist;
        if (a.anchored) {
          b.x += nx * overlap;
          b.y += ny * overlap;
        } else if (b.anchored) {
          a.x -= nx * overlap;
          a.y -= ny * overlap;
        } else {
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
        }

        if (avn - bvn <= 0) continue; // already separating
        if (a.anchored) {
          const delta = -bvn * BOUNCE - bvn;
          b.vx += delta * nx;
          b.vy += delta * ny;
          b.spin = -b.spin;
        } else if (b.anchored) {
          const delta = -avn * BOUNCE - avn;
          a.vx += delta * nx;
          a.vy += delta * ny;
          a.spin = -a.spin;
        } else {
          const total = a.mass + b.mass;
          const newA = (((a.mass - b.mass) * avn + 2 * b.mass * bvn) / total) * BOUNCE;
          const newB = (((b.mass - a.mass) * bvn + 2 * a.mass * avn) / total) * BOUNCE;
          a.vx += (newA - avn) * nx;
          a.vy += (newA - avn) * ny;
          b.vx += (newB - bvn) * nx;
          b.vy += (newB - bvn) * ny;
          [a.spin, b.spin] = [b.spin, a.spin];
        }
        this.hit(a, Math.atan2(ny, nx));
        this.hit(b, Math.atan2(-ny, -nx));
        this.ring(a.x + nx * a.radius, a.y + ny * a.radius, Math.min(a.radius, b.radius));
      }
    }
  }

  /** Start the squash for one duck, along the world-space contact normal. */
  private hit(duck: Duck, normal: number): void {
    if (duck.anchored) return; // the hero holds perfectly still, by design
    duck.squishLeft = SQUISH_SECONDS;
    duck.normal = normal;
  }

  /** Record a collision as a ring, at the point of contact. */
  private ring(x: number, y: number, radius: number): void {
    spawnRing(this.rings, x, y, radius);
  }

  /** How flat a duck is right now, 1 being round. */
  private squish(duck: Duck): number {
    if (duck.squishLeft <= 0) return 1;
    const through = 1 - duck.squishLeft / SQUISH_SECONDS;
    const idx = Math.min(SQUISH_CURVE.length - 1, Math.floor(through * SQUISH_CURVE.length));
    return SQUISH_CURVE[idx]!;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const hero = this.ducks.find((duck) => duck.anchored);
    if (hero) this.drawHalo(ctx, hero);
    drawRings(ctx, this.rings, this.palette.primary);

    // The hero draws last, so the crowd passes behind him rather than over him.
    const order = [...this.ducks].sort((a, b) => Number(a.anchored) - Number(b.anchored));
    for (const duck of order) {
      const size = duck.radius / RADIUS_OF_SIZE;
      const flat = this.squish(duck);
      ctx.save();
      // Squash along the contact normal: rotate into the normal's frame,
      // flatten one axis, rotate back, then let the rig apply the tumble.
      ctx.translate(duck.x, duck.y);
      ctx.rotate(duck.normal);
      ctx.scale(1 / flat, flat);
      ctx.rotate(-duck.normal);
      this.stamp(ctx, duck, size);
      ctx.restore();
    }
  }

  /** The theme's one big statement: a soft halo of primary behind the hero. */
  private drawHalo(ctx: CanvasRenderingContext2D, hero: Duck): void {
    const radius = hero.radius * 3.4;
    const gradient = ctx.createRadialGradient(
      hero.x,
      hero.y,
      hero.radius * 0.3,
      hero.x,
      hero.y,
      radius,
    );
    gradient.addColorStop(0, this.palette.primary);
    gradient.addColorStop(1, 'transparent');
    ctx.save();
    // A glow lightens; on a near-white ground there is no headroom to lighten
    // into, and the same fill lands as a grey smudge. Multiply turns it into a
    // soft coloured pool instead — the light-theme equivalent of the same idea.
    ctx.globalCompositeOperation = this.light ? 'multiply' : 'lighter';
    ctx.globalAlpha = this.light ? 0.14 : 0.22;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draw one duck, centred on the current origin. */
  private stamp(ctx: CanvasRenderingContext2D, duck: Duck, size: number): void {
    const art = this.art;
    if (!art) {
      // Until the art loads, a plain disc in the theme's own accent — never a
      // stand-in duck, which would flash a wrong mascot for one frame.
      ctx.fillStyle = this.palette.muted;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, size * RADIUS_OF_SIZE, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const outfits =
      !duck.anchored && this.wardrobe
        ? this.wardrobe[this.wornBy(duck, this.wardrobe.length)]
        : art.outfits;
    drawDuck(ctx, outfits ? { ...art, outfits } : art, {
      time: this.clock + duck.phase,
      width: size,
      rotate: Math.sin((duck.angle * Math.PI) / 180) * SWAY_DEGREES,
      facing: duck.facing,
      // Only the hero plays the gag: twelve ducks doing it at once is a tic,
      // and he is the one thing on screen holding still enough to be watched.
      peek: duck.anchored ? peekAt(this.clock, HERO_PEEK_EVERY) : 0,
    });
  }
}

export function createDuckYard(options: SceneOptions): DuckYard {
  return new DuckYard(options);
}
