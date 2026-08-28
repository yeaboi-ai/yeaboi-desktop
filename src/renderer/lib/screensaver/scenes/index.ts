// One place that knows which style is which scene.

import type { Scene, SceneOptions } from '../scene';
import type { SceneStyle } from '../styles';
import { createAurora } from './aurora';
import { createConstellation } from './constellation';
import { createDuckYard } from './duck-yard';
import { createRicochet } from './ricochet';

const FACTORIES: Record<SceneStyle, (options: SceneOptions) => Scene> = {
  'duck-yard': createDuckYard,
  constellation: createConstellation,
  ricochet: createRicochet,
  aurora: createAurora,
};

export function createScene(style: SceneStyle, options: SceneOptions): Scene {
  return FACTORIES[style](options);
}

export { Aurora } from './aurora';
export { Constellation } from './constellation';
export { DuckYard, duckCount, duckSize } from './duck-yard';
export { Ricochet } from './ricochet';
