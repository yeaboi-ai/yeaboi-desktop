// Loading the duck's three layers, once for the whole app — and the wardrobe:
// every persona's layers, and the robo already wearing each.
//
// Split from duck-rig.ts because these imports are what make a module
// un-importable in a Node test: vitest has no .png loader. The rig takes the
// art as a parameter, so the scenes stay testable and only this file and the
// canvas components ever touch an image.

import baseSrc from '@yeaboi-ai/design/assets/duck/base.png';
import glassesSrc from '@yeaboi-ai/design/assets/duck/glasses.png';
import wingSrc from '@yeaboi-ai/design/assets/duck/wing.png';
import astronautSrc from '@/assets/brand/persona-astronaut.png';
import chefSrc from '@/assets/brand/persona-chef.png';
import detectiveSrc from '@/assets/brand/persona-detective.png';
import djSrc from '@/assets/brand/persona-dj.png';
import engineerSrc from '@/assets/brand/persona-engineer.png';
import martialBodySrc from '@/assets/brand/persona-martial-body.png';
import martialSrc from '@/assets/brand/persona-martial.png';
import teacherSrc from '@/assets/brand/persona-teacher.png';
import wizardSrc from '@/assets/brand/persona-wizard.png';
import roboAstronautSrc from '@/assets/brand/robo-astronaut.png';
import roboChefSrc from '@/assets/brand/robo-chef.png';
import roboDetectiveSrc from '@/assets/brand/robo-detective.png';
import roboDjSrc from '@/assets/brand/robo-dj.png';
import roboEngineerSrc from '@/assets/brand/robo-engineer.png';
import roboMartialSrc from '@/assets/brand/robo-martial.png';
import roboTeacherSrc from '@/assets/brand/robo-teacher.png';
import roboWizardSrc from '@/assets/brand/robo-wizard.png';
import { PERSONA_IDS, type OutfitSlot, type PersonaId } from '@/lib/yeaboi/personas';
import type { DuckArt, OutfitLayer } from './duck-rig';

/** Rows above the sprite on every persona's canvas; the generator's OUTFIT_HEADROOM. */
export const OUTFIT_HEADROOM = 40;

/** The three layers as URLs, for a DOM rig (the front page's lead duck). */
export const DUCK_SRC = { base: baseSrc, wing: wingSrc, glasses: glassesSrc } as const;

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

/** Each persona's layer files, in the order the rig stacks them. */
export const PERSONA_SRC: Record<PersonaId, readonly { src: string; slot: OutfitSlot }[]> = {
  engineer: [{ src: engineerSrc, slot: 'top' }],
  teacher: [{ src: teacherSrc, slot: 'top' }],
  martial: [
    { src: martialBodySrc, slot: 'body' },
    { src: martialSrc, slot: 'top' },
  ],
  chef: [{ src: chefSrc, slot: 'top' }],
  astronaut: [{ src: astronautSrc, slot: 'top' }],
  dj: [{ src: djSrc, slot: 'top' }],
  detective: [{ src: detectiveSrc, slot: 'top' }],
  wizard: [{ src: wizardSrc, slot: 'top' }],
};

/** The robo already wearing each persona, flattened by the generator. */
export const ROBO_SRC: Record<PersonaId, string> = {
  engineer: roboEngineerSrc,
  teacher: roboTeacherSrc,
  martial: roboMartialSrc,
  chef: roboChefSrc,
  astronaut: roboAstronautSrc,
  dj: roboDjSrc,
  detective: roboDetectiveSrc,
  wizard: roboWizardSrc,
};

/** Every persona's layers, once. */
export type Wardrobe = Record<PersonaId, readonly OutfitLayer[]>;

let wardrobe: Wardrobe | null = null;
let wardrobeLoading: Promise<Wardrobe> | null = null;

export function loadWardrobe(): Promise<Wardrobe> {
  if (wardrobe) return Promise.resolve(wardrobe);
  wardrobeLoading ??= Promise.all(
    PERSONA_IDS.map((id) =>
      Promise.all(
        PERSONA_SRC[id].map((layer) =>
          image(layer.src).then((img): OutfitLayer => ({
            image: img,
            headroom: OUTFIT_HEADROOM,
            slot: layer.slot,
          })),
        ),
      ),
    ),
  ).then((layers) => {
    wardrobe = Object.fromEntries(
      PERSONA_IDS.map((id, i) => [id, layers[i]!]),
    ) as unknown as Wardrobe;
    return wardrobe;
  });
  return wardrobeLoading;
}

export function wardrobeNow(): Wardrobe | null {
  return wardrobe;
}
