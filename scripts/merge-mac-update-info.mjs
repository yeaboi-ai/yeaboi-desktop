#!/usr/bin/env node
// Merge the two mac legs' latest-mac.yml into one.
//
// electron-builder merges the archs of a single invocation, but the arm64 and x64
// builds run on different runners and neither knows about the other: each writes a
// latest-mac.yml listing only its own files, and the second upload replaces the
// first. What that costs, via MacUpdater.filterFilesForArch: an Intel install whose
// metadata lists only arm64 filters every candidate out and the update hard-errors,
// and an arm64 install whose metadata lists only x64 silently updates onto the Intel
// build.
//
// Usage:
//   node scripts/merge-mac-update-info.mjs <artifact-dir> <output.yml>

import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';

/** Every latest-mac.yml under a directory, at any depth. */
export function findUpdateInfo(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findUpdateInfo(path));
    else if (entry.name === 'latest-mac.yml') found.push(path);
  }
  return found.sort();
}

/** One update descriptor covering both architectures. */
export function merge(documents) {
  if (!documents.length) throw new Error('no latest-mac.yml found — did the mac legs run?');
  const versions = [...new Set(documents.map((d) => d.version))];
  if (versions.length !== 1)
    throw new Error(`legs disagree on the version: ${versions.join(', ')}`);

  const files = [];
  for (const doc of documents) {
    for (const file of doc.files ?? []) {
      if (!files.some((seen) => seen.url === file.url)) files.push(file);
    }
  }

  const archs = ['arm64', 'x64'].filter((arch) =>
    files.some((f) => (arch === 'arm64' ? f.url.includes('arm64') : !f.url.includes('arm64'))),
  );
  if (archs.length !== 2) {
    throw new Error(`merged metadata covers only ${archs.join(', ') || 'nothing'} — expected both`);
  }

  // path/sha512 are the legacy single-file fallback; a mac applies an update from
  // the zip, never the dmg, so that is what they have to name.
  const fallback = files.find((f) => f.url.endsWith('.zip'));
  if (!fallback) throw new Error('no .zip among the files — electron-updater cannot apply a dmg');

  return {
    version: versions[0],
    files,
    path: fallback.url,
    sha512: fallback.sha512,
    releaseDate: documents[0].releaseDate ?? new Date().toISOString(),
  };
}

function main() {
  const [root, out] = argv.slice(2);
  if (!root || !out)
    throw new Error('usage: merge-mac-update-info.mjs <artifact-dir> <output.yml>');
  if (!statSync(root, { throwIfNoEntry: false })) throw new Error(`no such directory: ${root}`);

  const paths = findUpdateInfo(root);
  console.log(`merging ${paths.length}: ${paths.join(', ')}`);
  const merged = merge(paths.map((p) => YAML.parse(readFileSync(p, 'utf8'))));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, YAML.stringify(merged));
  console.log(`✓ ${out}: ${merged.version}, ${merged.files.length} files`);
  for (const file of merged.files) console.log(`  ${file.url}`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    exit(1);
  }
}
