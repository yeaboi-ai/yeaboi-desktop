// The committed mascot sprites — present and correctly sized.
//
// `scripts/gen_mascot_sprites.py` derives them from the vendored duck art and
// needs Pillow, which this repo has no environment for; `make mascots`
// borrows one for the length of a command. These assertions read the PNG
// headers directly so the guard runs in the ordinary lane.
//
// Every number here is PARSED out of the generator rather than restated, so
// the two cannot drift. A parse that finds nothing throws.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONA_IDS } from '../src/shared/personas';
import { PERSONA_LAYERS } from '../src/renderer/lib/yeaboi/personas';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = readFileSync(resolve(ROOT, 'scripts/gen_mascot_sprites.py'), 'utf8');

function constant(name: string): string {
  const match = GENERATOR.match(new RegExp(`^${name} = (.+)$`, 'm'));
  if (!match) throw new Error(`gen_mascot_sprites.py no longer declares ${name}`);
  return match[1]!;
}

/** The names in a `("a", "b", ...)` constant. */
function names(name: string): string[] {
  return [...constant(name).matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
}

function pair(name: string): [number, number] {
  return [...constant(name).matchAll(/\d+/g)].map((m) => Number(m[0])) as [number, number];
}

const HEADROOM = Number.parseInt(constant('HEADROOM'), 10);
const OUTFIT_HEADROOM = Number.parseInt(constant('OUTFIT_HEADROOM'), 10);
const [SOURCE_W, SOURCE_H] = pair('SOURCE_SIZE');
// The pet's canvas is derived from the art rather than written down: the same
// duck at a bigger raster, with the headroom scaled to match.
const PET_W = Number.parseInt(constant('PET_WIDTH'), 10);
const PET_SCALE = PET_W / SOURCE_W;
const PET_HEADROOM = Math.round(OUTFIT_HEADROOM * PET_SCALE);
const PET_H = Math.round(SOURCE_H * PET_SCALE) + PET_HEADROOM;
const ROBO = constant('ROBO').replaceAll('"', '');
const PERSONAS = names('PERSONAS');
const BODY_PERSONAS = names('BODY_PERSONAS');

const layerFiles = (persona: string): string[] =>
  BODY_PERSONAS.includes(persona)
    ? [`persona-${persona}.png`, `persona-${persona}-body.png`]
    : [`persona-${persona}.png`];
const OUTFITS = PERSONAS.flatMap(layerFiles);
const DRESSED = PERSONAS.map((persona) => `robo-${persona}.png`);

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const brand = (file: string): string => resolve(ROOT, 'src/renderer/assets/brand', file);
const pet = (file: string): string => resolve(ROOT, 'src/renderer/public/pet/assets', file);

describe('mascot sprites', () => {
  it('committed the robo at source scale plus the antenna headroom', () => {
    expect(pngSize(brand(ROBO))).toEqual({ width: SOURCE_W, height: SOURCE_H + HEADROOM });
  });

  it('committed every persona layer and every dressed robo on the outfit canvas', () => {
    expect(PERSONAS).toHaveLength(8);
    for (const persona of BODY_PERSONAS) expect(PERSONAS).toContain(persona);
    for (const file of [...OUTFITS, ...DRESSED]) {
      expect(pngSize(brand(file)), file).toEqual({
        width: SOURCE_W,
        height: SOURCE_H + OUTFIT_HEADROOM,
      });
    }
  });

  it('committed every persona layer at the pet’s scale, with the pet’s headroom', () => {
    // The pet draws the same art larger, and everything above it scales with
    // the art rather than with a number: a cell is 7.5px there either way.
    const scale = PET_W / SOURCE_W;
    expect(PET_HEADROOM).toBe(Math.round(OUTFIT_HEADROOM * scale));
    for (const file of OUTFITS) {
      expect(pngSize(pet(file)), file).toEqual({ width: PET_W, height: PET_H });
    }
  });

  it('derives from the same sprite DuckMark draws, pixel-for-pixel', () => {
    // The source layers are the vendored design package's — a resampled robo
    // blurs beside the crisp pixel duck it sits next to.
    expect(GENERATOR).toContain('@yeaboi-ai');
    expect(pngSize(resolve(ROOT, 'node_modules/@yeaboi-ai/design/assets/duck/base.png'))).toEqual({
      width: SOURCE_W,
      height: SOURCE_H,
    });
  });

  it('is what the marks, the canvas rig and the pet actually import, persona for persona', () => {
    const art = readFileSync(resolve(ROOT, 'src/renderer/lib/screensaver/duck-art.ts'), 'utf8');
    const outfit = readFileSync(resolve(ROOT, 'src/shared/pet-outfit.ts'), 'utf8');
    for (const file of [...OUTFITS, ...DRESSED]) expect(art).toContain(`@/assets/brand/${file}`);
    // The TypeScript roster is the generator's, in the same order, and agrees
    // on who has a layer under the wing.
    expect([...PERSONA_IDS]).toEqual(PERSONAS);
    expect(PERSONA_IDS.filter((id) => PERSONA_LAYERS[id].includes('body'))).toEqual(BODY_PERSONAS);
    expect(outfit).toContain(`${PET_HEADROOM} / ${PET_H - PET_HEADROOM}`);
    // The rig offsets a layer by the same headroom the generator drew it with.
    expect(art).toMatch(new RegExp(`OUTFIT_HEADROOM = ${OUTFIT_HEADROOM}\\b`));
  });
});
