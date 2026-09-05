// Move the app's own version — package.json and the two copies in package-lock.json.
//
//   node scripts/bump-version.mjs <major|minor|patch>   prints the new version
//   node scripts/bump-version.mjs --current             prints the current one
//
// auto-version.yml runs this on a release-worthy PR; a human runs it by hand
// for the same reason. The version is the app's own line, independent of the
// bundled yeaboi wheel, and electron-updater compares it — so it only ever goes
// up, and never below the 4.0.0 the independent line started at.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

export const LEVELS = ['major', 'minor', 'patch'];

/** The floor of the independent line: the last shared-version release was 3.32.0. */
export const FLOOR_MAJOR = 4;

export function bump(version, level) {
  if (!LEVELS.includes(level)) {
    throw new Error(`level must be one of ${LEVELS.join('|')}, got ${JSON.stringify(level)}`);
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`expected an X.Y.Z version, got ${JSON.stringify(version)}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major < FLOOR_MAJOR) {
    throw new Error(
      `${version} is below the independent line — the app never goes under ${FLOOR_MAJOR}.0.0`,
    );
  }
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function readVersion(root) {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
}

/** Rewrite the version keys by editing the parsed objects: the lock carries a
 *  "version" on every dependency, so a text replace is never safe. Both files
 *  round-trip byte-for-byte through a two-space stringify. */
export function writeVersion(root, next) {
  const edit = (file, mutate) => {
    const path = resolve(root, file);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    mutate(parsed);
    writeFileSync(path, JSON.stringify(parsed, null, 2) + '\n');
  };
  edit('package.json', (pkg) => {
    pkg.version = next;
  });
  edit('package-lock.json', (lock) => {
    lock.version = next;
    lock.packages[''].version = next;
  });
}

function main() {
  const root = resolve(import.meta.dirname, '..');
  const arg = argv[2];
  if (arg === '--current') {
    console.log(readVersion(root));
    return;
  }
  const next = bump(readVersion(root), arg);
  writeVersion(root, next);
  console.log(next);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    exit(1);
  }
}
