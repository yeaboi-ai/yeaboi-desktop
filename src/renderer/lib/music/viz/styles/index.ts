// The six styles, by id, and the catalogue the tiles are built from.

import { VIZ_STYLES, type VizStyleId } from '@shared/music';
import { bars } from './bars';
import { blocks } from './blocks';
import { ink } from './ink';
import { pulse } from './pulse';
import { rings } from './rings';
import type { VizPainter } from './types';
import { wave } from './wave';

export const PAINTERS: Record<VizStyleId, VizPainter> = { blocks, bars, wave, ink, rings, pulse };

export function painterFor(id: VizStyleId): VizPainter {
  return PAINTERS[id] ?? PAINTERS.blocks;
}

export const VIZ_STYLE_CATALOGUE: readonly { id: VizStyleId; name: string; blurb: string }[] =
  VIZ_STYLES.map((id) => ({ id, name: PAINTERS[id].name, blurb: PAINTERS[id].blurb }));

export { createPainterCache } from './types';
export type { PainterCache, VizGeometry, VizPainter, VizSize, VizStyleOptions } from './types';
