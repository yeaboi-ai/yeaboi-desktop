// Loading the duck's three layers, once for the whole app.
//
// Split from duck-rig.ts because these imports are what make a module
// un-importable in a Node test: vitest has no .png loader. The rig takes the
// art as a parameter, so the scenes stay testable and only this file and the
// canvas component ever touch an image.

import baseSrc from '@yeaboi-ai/design/assets/duck/base.png';
import glassesSrc from '@yeaboi-ai/design/assets/duck/glasses.png';
import wingSrc from '@yeaboi-ai/design/assets/duck/wing.png';
import hardhatSrc from '@/assets/brand/outfit-hardhat.png';
import ringSrc from '@/assets/brand/outfit-ring.png';
import roboHardhatSrc from '@/assets/brand/robo-hardhat.png';
import roboRingSrc from '@/assets/brand/robo-ring.png';
import roboSrc from '@/assets/brand/robo.png';
import type { Door } from '@/lib/yeaboi/home';
import type { DuckArt, OutfitLayer } from './duck-rig';

/** Rows above the sprite on every kit's canvas; the generator's OUTFIT_HEADROOM. */
export const OUTFIT_HEADROOM = 40;

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

let robo: HTMLImageElement | null = null;
let roboLoading: Promise<HTMLImageElement> | null = null;

/** The Agents world's mascot: one layer, fetched once. */
export function loadRoboArt(): Promise<HTMLImageElement> {
  if (robo) return Promise.resolve(robo);
  roboLoading ??= image(roboSrc).then((img) => {
    robo = img;
    return img;
  });
  return roboLoading;
}

export function roboArtNow(): HTMLImageElement | null {
  return robo;
}

/** A kit per door, once; and the robo already wearing each. */
export type Outfits = Record<Door, OutfitLayer>;
export type RoboKit = Record<Door, HTMLImageElement>;

let outfits: Outfits | null = null;
let outfitsLoading: Promise<Outfits> | null = null;

export function loadOutfits(): Promise<Outfits> {
  if (outfits) return Promise.resolve(outfits);
  outfitsLoading ??= Promise.all([image(hardhatSrc), image(ringSrc)]).then(([hardhat, ring]) => {
    outfits = {
      projects: { image: hardhat, headroom: OUTFIT_HEADROOM, slot: 'top' },
      sessions: { image: ring, headroom: OUTFIT_HEADROOM, slot: 'body' },
    };
    return outfits;
  });
  return outfitsLoading;
}

export function outfitsNow(): Outfits | null {
  return outfits;
}

let roboKit: RoboKit | null = null;
let roboKitLoading: Promise<RoboKit> | null = null;

export function loadRoboKit(): Promise<RoboKit> {
  if (roboKit) return Promise.resolve(roboKit);
  roboKitLoading ??= Promise.all([image(roboHardhatSrc), image(roboRingSrc)]).then(
    ([projects, sessions]) => {
      roboKit = { projects, sessions };
      return roboKit;
    },
  );
  return roboKitLoading;
}

export function roboKitNow(): RoboKit | null {
  return roboKit;
}
