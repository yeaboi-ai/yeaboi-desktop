// The duck sprites are crisp, and stay crisp.
//
// `scripts/clean_duck_sprites.py` snaps every sprite's alpha to fully on or
// fully off. That is what this asserts, by decoding the PNGs here rather than
// shelling out to Pillow, so the guard runs in the ordinary lane.
//
// It matters most for the three inside the vendored design tarball: their
// source of truth is the yeaboi-frontend repo, so a design bump that has not
// had the same pass applied upstream puts the haze straight back. This test is
// what says so, instead of somebody noticing a fuzzy duck months later.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts/clean_duck_sprites.py'), 'utf8');

/** The sprite lists, parsed out of the script so the two cannot drift. */
function spritePaths(table: string): string[] {
  const block = SCRIPT.match(new RegExp(`${table}[^=]*= \\(([\\s\\S]*?)\\n\\)`));
  if (!block) throw new Error(`clean_duck_sprites.py no longer declares ${table}`);
  const paths = [...block[1]!.matchAll(/\("([^"]+)",/g)].map((m) => m[1]!);
  if (paths.length === 0) throw new Error(`${table} lists no sprites`);
  return paths;
}

const PET_SPRITES = spritePaths('SPRITES');
const DESIGN_SPRITES = spritePaths('DESIGN_SPRITES');

/**
 * Every distinct alpha value in an RGBA PNG.
 *
 * Only the 8-bit RGBA, non-interlaced case, which is what every sprite here is
 * — a file that is anything else fails loudly rather than being waved through.
 */
function alphaValues(file: Buffer): Set<number> {
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG');
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.subarray(at + 4, at + 8).toString('latin1');
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect({ depth: body[8], colour: body[9], interlace: body[12] }).toEqual({
        depth: 8,
        colour: 6, // truecolour with alpha
        interlace: 0,
      });
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const seen = new Set<number>();
  for (let row = 0; row < height; row += 1) {
    const start = row * (stride + 1);
    const filter = raw[start]!;
    raw.copy(current, 0, start + 1, start + 1 + stride);
    // The five PNG row filters. Undoing them is unavoidable: the alpha byte of
    // a filtered row is a delta, not a value.
    for (let i = 0; i < stride; i += 1) {
      const a = i >= 4 ? current[i - 4]! : 0;
      const b = previous[i]!;
      const c = i >= 4 ? previous[i - 4]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      current[i] = (current[i]! + add) & 0xff;
    }
    for (let i = 3; i < stride; i += 4) seen.add(current[i]!);
    current.copy(previous);
  }
  return seen;
}

describe('duck sprites', () => {
  it.each(PET_SPRITES)('%s has no part-transparent pixel', (relative) => {
    const alphas = alphaValues(readFileSync(resolve(ROOT, relative)));
    expect([...alphas].filter((a) => a !== 0 && a !== 255)).toEqual([]);
  });

  // The design sprites are shipped inside the vendored tarball, so they are
  // read from the installed copy — which is what the app actually draws.
  const installed = resolve(ROOT, 'node_modules/@yeaboi-ai/design');
  const describeDesign = existsSync(installed) ? describe : describe.skip;
  describeDesign('vendored from yeaboi-frontend', () => {
    it.each(DESIGN_SPRITES)('%s has no part-transparent pixel', (relative) => {
      const alphas = alphaValues(readFileSync(resolve(installed, relative)));
      expect([...alphas].filter((a) => a !== 0 && a !== 255)).toEqual([]);
    });
  });
});
