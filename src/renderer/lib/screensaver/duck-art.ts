// Loading the duck's three layers, once for the whole app.
//
// Split from duck-rig.ts because these imports are what make a module
// un-importable in a Node test: vitest has no .png loader. The rig takes the
// art as a parameter, so the scenes stay testable and only this file and the
// canvas component ever touch an image.

import baseSrc from '@yeaboi-ai/design/assets/duck/base.png';
import glassesSrc from '@yeaboi-ai/design/assets/duck/glasses.png';
import wingSrc from '@yeaboi-ai/design/assets/duck/wing.png';
import type { DuckArt } from './duck-rig';

let loaded: DuckArt | null = null;
let loading: Promise<DuckArt> | null = null;

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The art, fetched once. Resolves immediately on every call after the first. */
export function loadDuckArt(): Promise<DuckArt> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= Promise.all([image(baseSrc), image(wingSrc), image(glassesSrc)]).then(
    ([base, wing, glasses]) => {
      loaded = { base, wing, glasses };
      return loaded;
    },
  );
  return loading;
}

/** The art if it is already here, for a first frame that must not wait. */
export function duckArtNow(): DuckArt | null {
  return loaded;
}
