// The committed robo mascot sprite — present and correctly sized.
//
// `scripts/gen_robo_sprites.py` derives it from the website's duck art and
// needs Pillow, which this repo has no environment for; `make robo` borrows
// one for the length of a command. These assertions read the PNG header
// directly so the guard runs in the ordinary lane.
//
// Every number here is PARSED out of the generator rather than restated, so
// the two cannot drift. A parse that finds nothing throws.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = readFileSync(resolve(ROOT, 'scripts/gen_robo_sprites.py'), 'utf8');

function constant(name: string): string {
  const match = GENERATOR.match(new RegExp(`^${name} = (.+)$`, 'm'));
  if (!match) throw new Error(`gen_robo_sprites.py no longer declares ${name}`);
  return match[1]!;
}

const HEADROOM = Number.parseInt(constant('HEADROOM'), 10);
const [SOURCE_W, SOURCE_H] = [...constant('SOURCE_SIZE').matchAll(/\d+/g)].map((m) =>
  Number(m[0]),
) as [number, number];
const ROBO = constant('ROBO').replaceAll('"', '');

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('robo mascot sprite', () => {
  it('committed the sprite at source scale plus the antenna headroom', () => {
    expect(pngSize(resolve(ROOT, 'src/renderer/assets/brand', ROBO))).toEqual({
      width: SOURCE_W,
      height: SOURCE_H + HEADROOM,
    });
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

  it('is what the RoboMark actually imports', () => {
    const mark = readFileSync(resolve(ROOT, 'src/renderer/components/brand/robo.tsx'), 'utf8');
    expect(mark).toContain(`@/assets/brand/${ROBO}`);
  });
});
