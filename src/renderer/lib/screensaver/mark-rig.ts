// A one-layer mascot on a canvas: the robo, which has no wing or shades to
// move on their own. It bobs, rocks and casts the same shadow as the duck so
// the two read as the same creature in two materials.

import { swing, type DuckPose } from './duck-rig';

const BOB_PERIOD = 3.1;
const BOB_LIFT = 0.035;
const BOB_ROTATE = -1.2;
const SHADOW_OFFSET = 5 / 64;
const SHADOW_BLUR = 4 / 64;
const SHADOW_ALPHA = 0.45;

export type MarkPose = Omit<DuckPose, 'peek'>;

/** Draw the image centred on the current origin, at `pose.width` wide. */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  pose: MarkPose,
): void {
  const w = pose.width;
  const aspect = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1;
  const h = w * aspect;

  ctx.save();
  ctx.imageSmoothingEnabled = pose.smooth ?? false;
  if (pose.alpha !== undefined) ctx.globalAlpha *= pose.alpha;
  if (pose.rotate) ctx.rotate((pose.rotate * Math.PI) / 180);
  if (pose.squash !== undefined && pose.squash !== 1) ctx.scale(1 / pose.squash, pose.squash);
  const bob = swing(pose.time, BOB_PERIOD);
  ctx.translate(0, -h * BOB_LIFT * bob);
  ctx.rotate((BOB_ROTATE * bob * Math.PI) / 180);
  if ((pose.facing ?? 'right') === 'right') ctx.scale(-1, 1);
  ctx.shadowColor = `rgb(0 0 0 / ${SHADOW_ALPHA})`;
  ctx.shadowOffsetY = w * SHADOW_OFFSET;
  ctx.shadowBlur = w * SHADOW_BLUR;
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}
