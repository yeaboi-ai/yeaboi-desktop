// A duck adrift in a field of stars.
//
// The quiet one. Nothing collides and nothing accelerates — points cross the
// window and wrap, and the only event is two of them coming near enough to draw
// a line between. The line fades with distance, so the graph forms and
// dissolves rather than blinking.
//
// The duck is a point like any other, and that is the whole idea: it drifts on
// the same rules, so the field wires itself to it as it passes and lets go
// again. Its links are drawn in the theme's primary rather than the muted grey
// the field uses, so the eye finds it without the duck itself being recoloured.

import { drawDuck, peekAt, type DuckArt } from '../duck-rig';
import type { Palette } from '../palette';
import { between, type Scene, type SceneOptions } from '../scene';

const DENSITY = 1 / 22000; // points per square pixel
const MIN_POINTS = 24;
const MAX_POINTS = 110;
const SPEED = [6, 20] as const; // px/s
const LINK = 170; // px — beyond this, no line
const DOT = [1.8, 3.4] as const;
/** The duck reaches further than a star does, so it is never quite alone. */
const DUCK_LINK = 260;
const DUCK_SPEED = [10, 16] as const;

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colour: string;
}

export class Constellation implements Scene {
  private points: Point[] = [];
  private width: number;
  private height: number;
  private palette: Palette;
  private random: () => number;
  private still: boolean;
  private art: DuckArt | null = null;
  private clock = 0;
  /** The duck's own drift — one more point, drawn differently. */
  private duck = { x: 0, y: 0, vx: 0, vy: 0, size: 0 };

  constructor(options: SceneOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.random = options.random;
    this.still = options.still ?? false;
    this.populate();
  }

  private populate(): void {
    const wanted = Math.max(
      MIN_POINTS,
      Math.min(MAX_POINTS, Math.round(this.width * this.height * DENSITY)),
    );
    this.points = Array.from({ length: wanted }, (_, i) => {
      const heading = between(this.random, 0, Math.PI * 2);
      const speed = between(this.random, SPEED[0], SPEED[1]);
      return {
        x: between(this.random, 0, this.width),
        y: between(this.random, 0, this.height),
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        r: between(this.random, DOT[0], DOT[1]),
        // Mostly the primary, with the chart ramp for the occasional standout —
        // a field where every point is a different colour reads as confetti.
        colour:
          i % 5 === 0 ? this.palette.chart[i % this.palette.chart.length]! : this.palette.primary,
      };
    });

    const heading = between(this.random, 0, Math.PI * 2);
    const speed = between(this.random, DUCK_SPEED[0], DUCK_SPEED[1]);
    this.duck = {
      x: this.width / 2,
      y: this.height / 2,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      size: Math.max(52, Math.min(120, Math.round(Math.min(this.width, this.height) / 6))),
    };
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.populate();
  }

  repalette(palette: Palette): void {
    this.palette = palette;
    this.points.forEach((point, i) => {
      point.colour = i % 5 === 0 ? palette.chart[i % palette.chart.length]! : palette.primary;
    });
  }

  step(dt: number): void {
    if (this.still) return;
    this.clock += dt;

    // The duck bounces where the stars wrap: a star teleporting across the
    // window goes unnoticed, and the mascot doing it reads as a bug.
    const duck = this.duck;
    const margin = duck.size / 2;
    duck.x += duck.vx * dt;
    duck.y += duck.vy * dt;
    if (duck.x < margin) {
      duck.x = margin;
      duck.vx = Math.abs(duck.vx);
    } else if (duck.x > this.width - margin) {
      duck.x = this.width - margin;
      duck.vx = -Math.abs(duck.vx);
    }
    if (duck.y < margin) {
      duck.y = margin;
      duck.vy = Math.abs(duck.vy);
    } else if (duck.y > this.height - margin) {
      duck.y = this.height - margin;
      duck.vy = -Math.abs(duck.vy);
    }

    for (const point of this.points) {
      point.x += point.vx * dt;
      point.y += point.vy * dt;
      // Wrap with a margin, so a point slides off and returns rather than
      // popping out of existence at the edge.
      if (point.x < -LINK) point.x += this.width + LINK * 2;
      if (point.x > this.width + LINK) point.x -= this.width + LINK * 2;
      if (point.y < -LINK) point.y += this.height + LINK * 2;
      if (point.y > this.height + LINK) point.y -= this.height + LINK * 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // muted-foreground, not border: a border colour is tuned to be almost
    // invisible against its own surface, which is exactly wrong for the one
    // element that carries the whole picture.
    ctx.strokeStyle = this.palette.muted;
    ctx.lineWidth = 1;
    for (let i = 0; i < this.points.length; i += 1) {
      for (let j = i + 1; j < this.points.length; j += 1) {
        const a = this.points[i]!;
        const b = this.points[j]!;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist >= LINK) continue;
        ctx.globalAlpha = 0.75 * (1 - dist / LINK);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // The duck's own links, in primary rather than the field's grey, so the eye
    // finds the mascot without the mascot being recoloured to suit the theme.
    ctx.strokeStyle = this.palette.primary;
    ctx.lineWidth = 1.4;
    for (const point of this.points) {
      const dist = Math.hypot(point.x - this.duck.x, point.y - this.duck.y);
      if (dist >= DUCK_LINK) continue;
      ctx.globalAlpha = 0.6 * (1 - dist / DUCK_LINK);
      ctx.beginPath();
      ctx.moveTo(this.duck.x, this.duck.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (const point of this.points) {
      ctx.fillStyle = point.colour;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.art) {
      ctx.save();
      ctx.translate(this.duck.x, this.duck.y);
      drawDuck(ctx, this.art, {
        time: this.clock,
        width: this.duck.size,
        facing: this.duck.vx < 0 ? 'left' : 'right',
        peek: peekAt(this.clock, 11),
      });
      ctx.restore();
    }
  }
}

export function createConstellation(options: SceneOptions): Constellation {
  return new Constellation(options);
}
