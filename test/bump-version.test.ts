// The version bump auto-version.yml applies on a release-worthy PR.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLOOR_MAJOR, bump, readVersion, writeVersion } from '../scripts/bump-version.mjs';

const ROOT = resolve(import.meta.dirname, '..');

describe('bump', () => {
  it('moves one component and resets the ones below it', () => {
    expect(bump('4.0.0', 'patch')).toBe('4.0.1');
    expect(bump('4.0.1', 'minor')).toBe('4.1.0');
    expect(bump('4.1.7', 'major')).toBe('5.0.0');
  });

  it('refuses anything that is not a final X.Y.Z', () => {
    // An rc on main would break the next PR's bump and the one after.
    expect(() => bump('4.0', 'patch')).toThrow('expected an X.Y.Z version');
    expect(() => bump('4.0.0rc1', 'patch')).toThrow('expected an X.Y.Z version');
    expect(() => bump('v4.0.0', 'patch')).toThrow('expected an X.Y.Z version');
  });

  it('refuses to work below the independent line', () => {
    // electron-updater compares versions; 3.32.0 was the last shared-version
    // release, and a bump from under it would strand every install.
    expect(FLOOR_MAJOR).toBe(4);
    expect(() => bump('3.9.9', 'patch')).toThrow('below the independent line');
  });

  it('refuses an unknown level', () => {
    expect(() => bump('4.0.0', 'huge')).toThrow('level must be one of');
    expect(() => bump('4.0.0', undefined as unknown as string)).toThrow('level must be one of');
  });
});

describe('writeVersion', () => {
  const stage = () => {
    const dir = mkdtempSync(join(tmpdir(), 'bump-'));
    for (const file of ['package.json', 'package-lock.json']) {
      writeFileSync(join(dir, file), readFileSync(resolve(ROOT, file), 'utf8'));
    }
    return dir;
  };

  it('edits the three version keys', () => {
    const dir = stage();
    const before = readVersion(dir);
    const next = bump(before, 'minor');
    writeVersion(dir, next);

    expect(readVersion(dir)).toBe(next);
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe(next);
    expect(lock.packages[''].version).toBe(next);
  });

  it('keeps both files in the layout the repo commits', () => {
    // A bump that reflows either file turns every version PR into a noisy diff
    // and, for package-lock.json, an `npm ci` that no longer matches.
    const dir = stage();
    const before = readVersion(dir);
    const next = bump(before, 'patch');
    writeVersion(dir, next);
    for (const [file, expected] of [
      ['package.json', 1],
      ['package-lock.json', 2],
    ] as const) {
      const was = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
      const now = readFileSync(join(dir, file), 'utf8').split('\n');
      expect(now.length).toBe(was.length);
      const changed = was.map((line, i) => [line, now[i]]).filter(([a, b]) => a !== b);
      expect(changed.length).toBe(expected);
      for (const [a, b] of changed) {
        expect(a.trim()).toBe(`"version": "${before}",`);
        expect(b.trim()).toBe(`"version": "${next}",`);
      }
    }
  });
});
