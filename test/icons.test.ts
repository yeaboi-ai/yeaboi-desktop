// The committed desktop icon set — present, correctly sized, correctly shaped.
//
// `scripts/gen_desktop_icons.py` renders it from the website's duck art and
// needs Pillow, which this repo has no environment for; `make icons` borrows one
// for the length of a command. These assertions read the file headers directly
// instead, so the guard runs in the ordinary lane: a missing size only surfaces
// at package time otherwise, and electron-builder's failure mode for a malformed
// `.icns` is an app that installs with a blank dock icon.
//
// Every number here is PARSED out of the generator rather than restated, so the
// two cannot drift. A parse that finds nothing throws.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = readFileSync(resolve(ROOT, 'scripts/gen_desktop_icons.py'), 'utf8');

function constant(name: string): string {
  const match = GENERATOR.match(new RegExp(`^${name} = (.+)$`, 'm'));
  if (!match) throw new Error(`gen_desktop_icons.py no longer declares ${name}`);
  return match[1]!;
}

const int = (name: string) => Number.parseInt(constant(name), 10);
const ints = (name: string) => [...constant(name).matchAll(/\d+/g)].map((m) => Number(m[0]));

const MASTER = int('MASTER');
const TRAY_SIZE = int('TRAY_SIZE');
const DMG_ICON_Y = int('DMG_ICON_Y');
const PNG_SIZES = ints('PNG_SIZES');
const [DMG_WIDTH, DMG_HEIGHT] = ints('DMG_SIZE') as [number, number];

/** The icns chunk types the generator writes, in declaration order. */
const ICNS_TYPES = (() => {
  const block = GENERATOR.match(/^ICNS_TYPES = \{([\s\S]*?)^\}/m);
  if (!block) throw new Error('gen_desktop_icons.py no longer declares ICNS_TYPES');
  const types = [...block[1]!.matchAll(/b"(\w{4})":\s*(\d+)/g)].map((m) => m[1]!);
  if (types.length === 0) throw new Error('ICNS_TYPES parsed to nothing');
  return types;
})();

/** Width and height out of a PNG's IHDR — no image library needed. */
function pngSize(data: Buffer): [number, number] {
  expect(data.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

/** The chunk types in an .icns, in file order. */
function icnsTypes(data: Buffer): string[] {
  expect(data.subarray(0, 4).toString('ascii')).toBe('icns');
  const total = Math.min(data.readUInt32BE(4), data.length);
  const found: string[] = [];
  for (let offset = 8; offset < total;) {
    const kind = data.subarray(offset, offset + 4).toString('ascii');
    const length = data.readUInt32BE(offset + 4);
    if (length < 8) throw new Error(`icns chunk ${kind} claims ${length} bytes`);
    found.push(kind);
    offset += length;
  }
  return found;
}

/** Every committed file and the size it must carry. Mirrors `expected()`. */
const EXPECTED: Record<string, [number, number]> = {
  'build/icon.png': [MASTER, MASTER],
  'build/dmg-background.png': [DMG_WIDTH, DMG_HEIGHT],
  'build/dmg-background@2x.png': [DMG_WIDTH * 2, DMG_HEIGHT * 2],
  'resources/duck-tray.png': [TRAY_SIZE, TRAY_SIZE],
  'resources/duck-trayTemplate.png': [TRAY_SIZE, TRAY_SIZE],
  'resources/duck-trayTemplate@2x.png': [TRAY_SIZE * 2, TRAY_SIZE * 2],
  ...Object.fromEntries(PNG_SIZES.map((size) => [`build/icons/${size}x${size}.png`, [size, size]])),
};

describe('the set is complete', () => {
  it.each(Object.entries(EXPECTED))('%s exists at its declared size', (relative, size) => {
    const path = resolve(ROOT, relative);
    expect(existsSync(path), `${relative} is missing — run: make icons`).toBe(true);
    expect(pngSize(readFileSync(path))).toEqual(size);
  });

  it('the icns carries every type macOS looks for', () => {
    const found = icnsTypes(readFileSync(resolve(ROOT, 'build/icon.icns')));
    expect(new Set(found)).toEqual(new Set(ICNS_TYPES));
  });

  it('the ico is a real ico', () => {
    // An .ico is a 6-byte header: reserved 0, type 1, then the image count.
    const header = readFileSync(resolve(ROOT, 'build/icon.ico')).subarray(0, 6);
    expect(header.subarray(0, 4)).toEqual(Buffer.from('00000100', 'hex'));
    expect(header.readUInt16LE(4)).toBeGreaterThan(0);
  });

  it('is committed, and not merely present', () => {
    // On the machine that rendered them the icons are there either way; CI
    // checks out an app with none. A `build/` glob reaching .gitignore is all
    // it would take.
    const tracked = new Set(
      execFileSync('git', ['ls-files', 'build', 'resources'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean),
    );
    const missing = Object.keys(EXPECTED).filter((relative) => !tracked.has(relative));
    expect(missing, `rendered but never committed: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the tray icons match what the shell asks for', () => {
  // `tray.ts` names these three files; a rename here breaks a silent path.
  it('the template pair ships beside the colour icon', () => {
    const tray = readFileSync(resolve(ROOT, 'src/main/tray.ts'), 'utf8');
    for (const name of ['duck-tray.png', 'duck-trayTemplate.png', 'duck-trayTemplate@2x.png']) {
      expect(Object.keys(EXPECTED)).toContain(`resources/${name}`);
    }
    expect(tray).toContain('duck-tray.png');
    expect(tray).toContain('duck-trayTemplate.png');
  });

  it('the template is alpha-only', () => {
    // A template image whose colours survived would render as a black box.
    // Colour type 6 is RGBA and 4 is grey+alpha; either is fine as long as every
    // visible pixel is black, which is what the generator's stencil produces.
    // The cheap proxy here: the PNG must carry an alpha channel.
    const header = readFileSync(resolve(ROOT, 'resources/duck-trayTemplate.png'));
    expect([4, 6]).toContain(header[25]);
  });
});

describe('the dmg window and its backdrop agree', () => {
  it('the icons sit on the line the backdrop draws', () => {
    const dmg = parse(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8')).dmg;
    expect(dmg.window).toEqual({ width: DMG_WIDTH, height: DMG_HEIGHT });
    expect(new Set(dmg.contents.map((entry: { y: number }) => entry.y))).toEqual(
      new Set([DMG_ICON_Y]),
    );
  });
});
