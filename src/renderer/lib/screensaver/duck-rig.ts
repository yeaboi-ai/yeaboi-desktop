// The yeaboi duck, drawn on a canvas.
//
// A port of the three-layer rig in @design/primitives/Duck — base, wing and
// sunglasses, each with its own motion so no two ever fight over one transform.
// The timings and amplitudes below are taken verbatim from duck.module.css,
// because the mascot has to move the same way wherever it appears: the corner
// of the window, a live board, and now the screensaver.
//
// This module deliberately holds no image imports. The art is passed in, so the
// scenes that draw a duck stay importable in a Node test where a .png loader
// does not exist — see duck-art.ts for the loading half.

/** Natural size of the sprite sheet, from the committed art. */
export const DUCK_ART_W = 128;
export const DUCK_ART_H = 136;
export const DUCK_ASPECT = DUCK_ART_H / DUCK_ART_W;

/** The three layers, stacked in this order. */
export interface DuckArt {
  base: HTMLImageElement;
  wing: HTMLImageElement;
  glasses: HTMLImageElement;
}

// Verbatim from duck.module.css. The amplitudes there carry a note explaining
// why they are as large as they are: at half these values the flap read as a
// still image at any normal viewing distance.
const WING_PERIOD = 1.4;
const WING_LIFT = 0.045; // of sprite height
const WING_ROTATE = -5; // degrees
const WING_PIVOT_X = 0.42;
const WING_PIVOT_Y = 0.55;
const GLASSES_PERIOD = 2.6;
const GLASSES_DROP = 0.03;
const GLASSES_ROTATE = 0.8;
// The resting bob belongs to the body, so it carries the wing and the glasses
// with it — three layers rising together, not three loops that happen to overlap.
const BOB_PERIOD = 3.1;
const BOB_LIFT = 0.035;
const BOB_ROTATE = -1.2;
// `.base` casts this, at the drawn size the primitive uses. Expressed as
// fractions of the sprite so it holds at any size a scene picks.
const SHADOW_OFFSET = 5 / 64;
const SHADOW_BLUR = 4 / 64;
const SHADOW_ALPHA = 0.45;
/** The peek mannerism: shades down the bill, a look over the top, and back. */
const PEEK_DROP = 0.09;
const PEEK_ROTATE = -2;

export interface DuckPose {
  /** Seconds, for the continuous loops. */
  time: number;
  /** Drawn width in CSS pixels; height follows the sprite's aspect. */
  width: number;
  /**
   * Which way the duck looks. Right by default, because that is the duck
   * everyone has seen: the art is drawn looking left and the brand rig mirrors
   * it ("the duck reads better looking into the page"). Naming the direction
   * rather than exposing the mirror is what stops a caller reasoning about
   * which way the file happens to point.
   */
  facing?: 'left' | 'right';
  /** Body rotation in degrees — the yard's tumble, or a tilt. */
  rotate?: number;
  /** 0..1 of the peek gag, where 1 is shades fully down. */
  peek?: number;
  /** Squash along the local vertical, 1 being round. */
  squash?: number;
  /** Overall opacity. */
  alpha?: number;
  /**
   * Let the browser average pixels. Right when the duck is drawn smaller than
   * its 2x-crisp size (64px): nearest-neighbour minification throws away the
   * shades' hairlines. The brand marks make the same choice.
   */
  smooth?: boolean;
}

/** 0 → 1 → 0 across one period, the shape of an ease-in-out keyframe pair. */
export function swing(time: number, period: number): number {
  return (1 - Math.cos((2 * Math.PI * time) / period)) / 2;
}

/**
 * Draw the duck centred on the current origin.
 *
 * The caller owns position: translate (and rotate, if the scene tumbles) before
 * calling. Every layer is drawn in its own save/restore so the wing's pivot and
 * the glasses' bob never leak into each other — the same separation the CSS
 * achieves with three elements.
 */
export function drawDuck(ctx: CanvasRenderingContext2D, art: DuckArt, pose: DuckPose): void {
  const w = pose.width;
  const h = w * DUCK_ASPECT;
  const left = -w / 2;
  const top = -h / 2;

  ctx.save();
  // The art is pixel art at 2x the drawn size; smoothing it turns a deliberate
  // edge into mush. The primitive says the same thing with image-rendering.
  ctx.imageSmoothingEnabled = pose.smooth ?? false;
  if (pose.alpha !== undefined) ctx.globalAlpha *= pose.alpha;
  if (pose.rotate) ctx.rotate((pose.rotate * Math.PI) / 180);
  if (pose.squash !== undefined && pose.squash !== 1) ctx.scale(1 / pose.squash, pose.squash);

  // The body layer: the resting bob and the facing, both of which every other
  // layer inherits.
  const bob = swing(pose.time, BOB_PERIOD);
  ctx.translate(0, -h * BOB_LIFT * bob);
  ctx.rotate((BOB_ROTATE * bob * Math.PI) / 180);
  // The file looks left, so looking right is the mirrored one.
  if ((pose.facing ?? 'right') === 'right') ctx.scale(-1, 1);

  ctx.save();
  ctx.shadowColor = `rgb(0 0 0 / ${SHADOW_ALPHA})`;
  ctx.shadowOffsetY = w * SHADOW_OFFSET;
  ctx.shadowBlur = w * SHADOW_BLUR;
  ctx.drawImage(art.base, left, top, w, h);
  ctx.restore();

  const flap = swing(pose.time, WING_PERIOD);
  ctx.save();
  // Rotating about the shoulder rather than the sprite's centre is what makes
  // the flap read as a wing instead of a wobble.
  const pivotX = left + w * WING_PIVOT_X;
  const pivotY = top + h * WING_PIVOT_Y;
  ctx.translate(pivotX, pivotY + h * WING_LIFT * -flap);
  ctx.rotate((WING_ROTATE * flap * Math.PI) / 180);
  ctx.translate(-pivotX, -pivotY);
  ctx.drawImage(art.wing, left, top, w, h);
  ctx.restore();

  ctx.save();
  const peek = pose.peek ?? 0;
  // The gag outranks the resting bob rather than adding to it — two motions on
  // one pair of sunglasses reads as a glitch.
  const drop = peek > 0 ? PEEK_DROP * peek : GLASSES_DROP * swing(pose.time, GLASSES_PERIOD);
  const tilt = peek > 0 ? PEEK_ROTATE * peek : GLASSES_ROTATE * swing(pose.time, GLASSES_PERIOD);
  ctx.translate(0, h * drop);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.drawImage(art.glasses, left, top, w, h);
  ctx.restore();

  ctx.restore();
}

/**
 * The peek gag on a timer: 0 while resting, ramping to 1 and back.
 *
 * `every` seconds between gags, and the gag itself lasts `PEEK_SECONDS`. It
 * sits at the *end* of each period so a scene opens on the resting pose rather
 * than halfway through a look over the top.
 */
export const PEEK_SECONDS = 1.2;

export function peekAt(time: number, every: number, offset = 0): number {
  const phase = (time + offset) % every;
  const into = phase - (every - PEEK_SECONDS);
  if (into < 0) return 0;
  const through = into / PEEK_SECONDS;
  // Down, hold, back up — the 30%/65% hold in the CSS keyframe.
  if (through < 0.3) return through / 0.3;
  if (through < 0.65) return 1;
  return Math.max(0, 1 - (through - 0.65) / 0.35);
}
