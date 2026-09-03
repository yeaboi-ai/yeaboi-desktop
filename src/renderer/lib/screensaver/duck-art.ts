// Loading the duck's three layers, once for the whole app.
//
// Split from duck-rig.ts because these imports are what make a module
// un-importable in a Node test: vitest has no .png loader. The rig takes the
// art as a parameter, so the scenes stay testable and only this file and the
// canvas component ever touch an image.

import baseSrc from '@yeaboi-ai/design/assets/duck/base.png';
import glassesSrc from '@yeaboi-ai/design/assets/duck/glasses.png';
import wingSrc from '@yeaboi-ai/design/assets/duck/wing.png';
import bowtieSrc from '@/assets/brand/outfit-bowtie.png';
import capSrc from '@/assets/brand/outfit-cap.png';
import hardhatSrc from '@/assets/brand/outfit-hardhat.png';
import headsetSrc from '@/assets/brand/outfit-headset.png';
import propellerSrc from '@/assets/brand/outfit-propeller.png';
import ringSrc from '@/assets/brand/outfit-ring.png';
import roboBowtieSrc from '@/assets/brand/robo-bowtie.png';
import roboPropellerSrc from '@/assets/brand/robo-propeller.png';
import roboSrc from '@/assets/brand/robo.png';
import { KIT_SLOT, type Kit } from '@/lib/yeaboi/kits';
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

/** Every kit's layer, once; and the robo already wearing the Agents world's two. */
export type Outfits = Record<Kit, OutfitLayer>;
export type RoboKit = Partial<Record<Kit, HTMLImageElement>>;

export const OUTFIT_SRC: Record<Kit, string> = {
  hardhat: hardhatSrc,
  ring: ringSrc,
  cap: capSrc,
  headset: headsetSrc,
  propeller: propellerSrc,
  bowtie: bowtieSrc,
};

const ROBO_SRC: Partial<Record<Kit, string>> = {
  propeller: roboPropellerSrc,
  bowtie: roboBowtieSrc,
};

let outfits: Outfits | null = null;
let outfitsLoading: Promise<Outfits> | null = null;

export function loadOutfits(): Promise<Outfits> {
  if (outfits) return Promise.resolve(outfits);
  const kits = Object.keys(OUTFIT_SRC) as Kit[];
  outfitsLoading ??= Promise.all(kits.map((kit) => image(OUTFIT_SRC[kit]))).then((images) => {
    outfits = Object.fromEntries(
      kits.map((kit, i) => [
        kit,
        { image: images[i]!, headroom: OUTFIT_HEADROOM, slot: KIT_SLOT[kit] },
      ]),
    ) as Outfits;
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
  const kits = Object.keys(ROBO_SRC) as Kit[];
  roboKitLoading ??= Promise.all(kits.map((kit) => image(ROBO_SRC[kit]!))).then((images) => {
    roboKit = Object.fromEntries(kits.map((kit, i) => [kit, images[i]!]));
    return roboKit;
  });
  return roboKitLoading;
}

export function roboKitNow(): RoboKit | null {
  return roboKit;
}
