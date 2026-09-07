// The duck, loose in the window, with its name in tow.
//
// The oldest screensaver joke there is, and the one that earns its place: what
// bounces around is the mascot and the wordmark together, as one object. The
// duck keeps its own colours and turns to face the way it is travelling; the
// word beside it takes the next colour off the theme's chart ramp on every wall
// it touches, so the theme is what changes and the brand is what does not.
//
// The corner is a real event. When a bounce lands within a few pixels of an
// actual corner the pair holds its colour and swells for a beat, because
// everyone who has ever watched one of these was waiting for that.

import { drawDuck, peekAt, type DuckArt } from '../duck-rig';
import type { Palette } from '../palette';
import { between, type Scene, type SceneOptions } from '../scene';

const SPEED = [95, 140] as const; // px/s
const TEXT = 'yeaboi';
const CORNER_SLOP = 6; // px — how near an edge a second bounce counts as a corner
const CORNER_HOLD = 1.1; // seconds the celebration lasts
const CORNER_SWELL = 0.12;
/** The duck's height as a fraction of the wordmark's cap height. */
const DUCK_TO_TEXT = 1.5;
const GAP = 0.22; // between duck and word, as a fraction of the duck's width

export class Ricochet implements Scene {
  private width: number;
  private height: number;
  private palette: Palette;
  private still: boolean;
  private art: DuckArt | null = null;
  private clock = 0;
  private x = 0;
  private y = 0;
  private vx: number;
  private vy: number;
  private colourIndex: number;
  private cornerLeft = 0;
  private fontSize = 0;
  private duckW = 0;
  private markW = 0;
  private boxW = 0;
  private boxH = 0;
  private measured = false;

  constructor(options: SceneOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.still = options.still ?? false;
    const heading = between(options.random, 0.35, 1.2) * (options.random() < 0.5 ? 1 : -1);
    const speed = between(options.random, SPEED[0], SPEED[1]);
    this.vx = Math.cos(heading) * speed;
    this.vy = Math.sin(heading) * speed;
    this.colourIndex = Math.floor(options.random() * 8);
    this.layout();
    this.x = between(options.random, 0, Math.max(1, this.width - this.boxW));
    this.y = between(options.random, 0, Math.max(1, this.height - this.boxH));
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  private layout(): void {
    this.fontSize = Math.max(26, Math.min(104, Math.round(Math.min(this.width, this.height) / 8)));
    this.duckW = this.fontSize * DUCK_TO_TEXT;
    // Replaced by real metrics on the first draw; this only has to be close
    // enough that the pair does not start outside the window.
    this.markW = this.fontSize * TEXT.length * 0.5;
    this.measure();
    this.measured = false;
  }

  private measure(): void {
    this.boxW = this.duckW * (1 + GAP) + this.markW;
    this.boxH = Math.max(this.duckW, this.fontSize * 1.05);
  }

  private font(): string {
    return `italic ${this.fontSize}px "Instrument Serif", Georgia, serif`;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.layout();
    this.x = Math.min(this.x, Math.max(0, width - this.boxW));
    this.y = Math.min(this.y, Math.max(0, height - this.boxH));
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  repalette(palette: Palette): void {
    this.palette = palette;
  }

  step(dt: number): void {
    if (this.still) return;
    this.clock += dt;
    if (this.cornerLeft > 0) this.cornerLeft = Math.max(0, this.cornerLeft - dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const maxX = Math.max(0, this.width - this.boxW);
    const maxY = Math.max(0, this.height - this.boxH);
    let bounced = false;
    if (this.x <= 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx);
      bounced = true;
    } else if (this.x >= maxX) {
      this.x = maxX;
      this.vx = -Math.abs(this.vx);
      bounced = true;
    }
    if (this.y <= 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy);
      bounced = true;
    } else if (this.y >= maxY) {
      this.y = maxY;
      this.vy = -Math.abs(this.vy);
      bounced = true;
    }
    if (!bounced) return;

    // A corner is both walls at once, or near enough that the eye read it as one.
    const nearX = this.x <= CORNER_SLOP || this.x >= maxX - CORNER_SLOP;
    const nearY = this.y <= CORNER_SLOP || this.y >= maxY - CORNER_SLOP;
    if (nearX && nearY) {
      this.cornerLeft = CORNER_HOLD;
      return; // hold the colour — the corner is the payoff, not a colour change
    }
    this.colourIndex += 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.font = this.font();
    ctx.textBaseline = 'middle';
    if (!this.measured) {
      // Real metrics, now that a context exists and the face has loaded.
      this.markW = ctx.measureText(TEXT).width;
      this.measure();
      this.measured = true;
    }

    const swell =
      this.cornerLeft > 0
        ? 1 + CORNER_SWELL * Math.sin((this.cornerLeft / CORNER_HOLD) * Math.PI)
        : 1;
    const goingLeft = this.vx < 0;

    ctx.save();
    ctx.translate(this.x + this.boxW / 2, this.y + this.boxH / 2);
    ctx.scale(swell, swell);

    // The duck leads and the word is towed behind it, so the pair reads as one
    // thing going somewhere rather than two that happen to share a velocity.
    // Leading means the duck sits at whichever end it is travelling toward.
    const duckX = goingLeft ? -this.boxW / 2 + this.duckW / 2 : this.boxW / 2 - this.duckW / 2;
    const textX = goingLeft ? -this.boxW / 2 + this.duckW * (1 + GAP) : -this.boxW / 2;

    ctx.fillStyle = this.palette.chart[this.colourIndex % this.palette.chart.length]!;
    ctx.fillText(TEXT, textX, 0);

    if (this.art) {
      ctx.save();
      ctx.translate(duckX, 0);
      drawDuck(ctx, this.art, {
        time: this.clock,
        width: this.duckW,
        facing: goingLeft ? 'left' : 'right',
        // A look over the top on landing a corner — the one moment worth one.
        peek:
          this.cornerLeft > 0
            ? Math.sin((this.cornerLeft / CORNER_HOLD) * Math.PI)
            : peekAt(this.clock, 9),
      });
      ctx.restore();
    }
    ctx.restore();
  }
}

export function createRicochet(options: SceneOptions): Ricochet {
  return new Ricochet(options);
}
