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

const ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = readFileSync(resolve(ROOT, 'scripts/gen_mascot_sprites.py'), 'utf8');

function constant(name: string): string {
  const match = GENERATOR.match(new RegExp(`^${name} = (.+)$`, 'm'));
  if (!match) throw new Error(`gen_mascot_sprites.py no longer declares ${name}`);
  return match[1]!;
}

/** The file names in a `{"kit": "file.png", ...}` constant. */
function files(name: string): string[] {
  return [...constant(name).matchAll(/"([^"]+\.png)"/g)].map((m) => m[1]!);
}

const HEADROOM = Number.parseInt(constant('HEADROOM'), 10);
const OUTFIT_HEADROOM = Number.parseInt(constant('OUTFIT_HEADROOM'), 10);
const [SOURCE_W, SOURCE_H] = [...constant('SOURCE_SIZE').matchAll(/\d+/g)].map((m) =>
  Number(m[0]),
) as [number, number];
const ROBO = constant('ROBO').replaceAll('"', '');
const OUTFITS = files('OUTFITS');
const DRESSED = files('DRESSED');

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const brand = (file: string): string => resolve(ROOT, 'src/renderer/assets/brand', file);

describe('mascot sprites', () => {
  it('committed the robo at source scale plus the antenna headroom', () => {
    expect(pngSize(brand(ROBO))).toEqual({ width: SOURCE_W, height: SOURCE_H + HEADROOM });
  });

  it('committed both outfit layers and both dressed robos on the outfit canvas', () => {
    expect(OUTFITS).toHaveLength(2);
    expect(DRESSED).toHaveLength(2);
    for (const file of [...OUTFITS, ...DRESSED]) {
      expect(pngSize(brand(file)), file).toEqual({
        width: SOURCE_W,
        height: SOURCE_H + OUTFIT_HEADROOM,
      });
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

  it('is what the marks and the canvas rig actually import', () => {
    const mark = readFileSync(resolve(ROOT, 'src/renderer/components/brand/robo.tsx'), 'utf8');
    const art = readFileSync(resolve(ROOT, 'src/renderer/lib/screensaver/duck-art.ts'), 'utf8');
    expect(mark).toContain(`@/assets/brand/${ROBO}`);
    for (const file of [...OUTFITS, ...DRESSED]) expect(art).toContain(`@/assets/brand/${file}`);
    // The rig offsets an outfit layer by the same headroom the generator drew it with.
    expect(art).toMatch(new RegExp(`OUTFIT_HEADROOM = ${OUTFIT_HEADROOM}\\b`));
  });
});
