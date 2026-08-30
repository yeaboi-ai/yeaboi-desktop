// The committed onboarding lifecycle sprites — present and correctly sized.
//
// `scripts/gen_lifecycle_sprites.py` renders them from the website's duck art
// and needs Pillow, which this repo has no environment for; `make sprites`
// borrows one for the length of a command. These assertions read the PNG
// headers directly so the guard runs in the ordinary lane.
//
// Every number here is PARSED out of the generator rather than restated, so
// the two cannot drift. A parse that finds nothing throws.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = readFileSync(resolve(ROOT, 'scripts/gen_lifecycle_sprites.py'), 'utf8');

function constant(name: string): string {
  const match = GENERATOR.match(new RegExp(`^${name} = (.+)$`, 'm'));
  if (!match) throw new Error(`gen_lifecycle_sprites.py no longer declares ${name}`);
  return match[1]!;
}

const SPRITE_HEIGHT = Number.parseInt(constant('SPRITE_HEIGHT'), 10);
const [CANVAS_W, CANVAS_H] = [...constant('CANVAS').matchAll(/\d+/g)].map((m) => Number(m[0])) as [
  number,
  number,
];

/** The frame filenames the generator writes, in declaration order. */
const FRAMES = (() => {
  const block = GENERATOR.match(/^FRAMES = \(([\s\S]*?)^\)/m);
  if (!block) throw new Error('gen_lifecycle_sprites.py no longer declares FRAMES');
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
})();

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('onboarding lifecycle sprites', () => {
  it('declares the five lifecycle frames', () => {
    expect(FRAMES).toHaveLength(5);
    for (const stage of ['egg', 'crack', 'hatch', 'duckling', 'duck']) {
      expect(FRAMES).toContain(`lifecycle-${stage}.png`);
    }
  });

  it('committed each frame at the rendered sprite size', () => {
    const expected = {
      width: Math.round((CANVAS_W * SPRITE_HEIGHT) / CANVAS_H),
      height: SPRITE_HEIGHT,
    };
    for (const name of FRAMES) {
      expect(pngSize(resolve(ROOT, 'src/renderer/assets/onboarding', name))).toEqual(expected);
    }
  });

  it('is what the wizard footer actually imports', () => {
    const wizard = readFileSync(
      resolve(ROOT, 'src/renderer/components/onboarding/onboarding-wizard.tsx'),
      'utf8',
    );
    for (const name of FRAMES) {
      expect(wizard).toContain(`@/assets/onboarding/${name}`);
    }
  });
});
