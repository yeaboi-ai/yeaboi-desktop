// The duck, at rest, under slow fields of colour.
//
// The calm one: a handful of very large, very soft radial fields drifting on
// Lissajous paths over the theme's own background, and the duck sitting in
// front of them doing nothing much. Nothing collides and nothing has an edge,
// so at a glance it reads as the window's background gently moving rather than
// as a picture playing.
//
// The duck bobs on the same slow clock the fields drift on, and looks over the
// top of its shades now and then. It is the only thing here with a hard edge,
// which is what keeps it the subject rather than another blur.
//
// The blend is chosen from the ground rather than fixed. Plain alpha is the one
// option that is wrong everywhere: five overlapping colours averaged together
// come out grey, which is what a light theme showed. Additive is right on a
// dark ground and multiply on a light one, and which of those applies is a
// property of the background colour, so it is measured (see ../luminance).

import { drawDuck, peekAt, type DuckArt } from '../duck-rig';
import { isLightGround } from '../luminance';
import type { Palette } from '../palette';
import { between, type Scene, type SceneOptions } from '../scene';

const FIELDS = 5;
const RADIUS = [0.42, 0.72] as const; // fraction of the smaller window edge
const DRIFT = [0.014, 0.042] as const; // cycles per second
// Additive accumulates where fields overlap and multiply darkens, so the two
// grounds do not want the same weight.
const ALPHA_DARK = 0.5;
const ALPHA_LIGHT = 0.3;
/** A slow rise and fall, well under the drift so the two never look coupled. */
const BOB_PERIOD = 5.5;
const BOB_TRAVEL = 0.018; // of window height

interface Field {
  colour: string;
  radius: number;
  /** Lissajous: independent rates and phases per axis, so paths never repeat. */
  rateX: number;
  rateY: number;
  phaseX: number;
  phaseY: number;
  spanX: number;
  spanY: number;
}

export class Aurora implements Scene {
  private fields: Field[] = [];
  private width: number;
  private height: number;
  private palette: Palette;
  private random: () => number;
  private still: boolean;
  private time = 0;
  private light = false;
  private art: DuckArt | null = null;
  private duckSize = 0;

  constructor(options: SceneOptions) {
    this.width = options.width;
    this.height = options.height;
    this.palette = options.palette;
    this.random = options.random;
    this.still = options.still ?? false;
    this.light = isLightGround(this.palette.background);
    this.duckSize = Math.max(
      90,
      Math.min(260, Math.round(Math.min(this.width, this.height) / 3.2)),
    );
    this.populate();
    // A still frame must not be the blank opening pose, so start mid-drift.
    if (this.still) this.time = 12;
  }

  private colours(): string[] {
    const { primary, chart } = this.palette;
    return [
      primary,
      chart[1] ?? primary,
      chart[4] ?? primary,
      chart[2] ?? primary,
      chart[5] ?? primary,
    ];
  }

  private populate(): void {
    const min = Math.min(this.width, this.height);
    const palette = this.colours();
    this.fields = Array.from({ length: FIELDS }, (_, i) => ({
      colour: palette[i % palette.length]!,
      radius: between(this.random, RADIUS[0], RADIUS[1]) * min,
      rateX: between(this.random, DRIFT[0], DRIFT[1]),
      rateY: between(this.random, DRIFT[0], DRIFT[1]),
      phaseX: between(this.random, 0, Math.PI * 2),
      phaseY: between(this.random, 0, Math.PI * 2),
      spanX: between(this.random, 0.28, 0.5),
      spanY: between(this.random, 0.28, 0.5),
    }));
  }

  setArt(art: DuckArt): void {
    this.art = art;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    const min = Math.min(width, height);
    const wasMin = Math.min(this.width, this.height);
    this.width = width;
    this.height = height;
    this.duckSize = Math.max(90, Math.min(260, Math.round(min / 3.2)));
    // Rescale rather than re-seed: a window resize should not restart the sky.
    for (const field of this.fields) field.radius *= min / (wasMin || min);
  }

  repalette(palette: Palette): void {
    this.palette = palette;
    this.light = isLightGround(palette.background);
    const colours = this.colours();
    this.fields.forEach((field, i) => {
      field.colour = colours[i % colours.length]!;
    });
  }

  step(dt: number): void {
    if (this.still) return;
    this.time += dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalCompositeOperation = this.light ? 'multiply' : 'lighter';
    ctx.globalAlpha = this.light ? ALPHA_LIGHT : ALPHA_DARK;
    for (const field of this.fields) {
      const x =
        this.width *
        (0.5 + field.spanX * Math.sin(this.time * field.rateX * Math.PI * 2 + field.phaseX));
      const y =
        this.height *
        (0.5 + field.spanY * Math.cos(this.time * field.rateY * Math.PI * 2 + field.phaseY));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, field.radius);
      gradient.addColorStop(0, field.colour);
      // A hard stop at the rim would draw a disc; the colour has to reach zero
      // alpha before it gets there. transparent is the one colour keyword that
      // is not a theme decision.
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, field.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (!this.art) return;
    const bob = Math.sin((this.time / BOB_PERIOD) * Math.PI * 2) * this.height * BOB_TRAVEL;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2 + bob);
    drawDuck(ctx, this.art, {
      time: this.time,
      width: this.duckSize,
      peek: peekAt(this.time, 7),
    });
    ctx.restore();
  }
}

export function createAurora(options: SceneOptions): Aurora {
  return new Aurora(options);
}
