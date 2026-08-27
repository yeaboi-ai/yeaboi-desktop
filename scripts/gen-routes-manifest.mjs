// Code-generate contracts/v1/routes_manifest.json from the renderer's route
// registry — the surface-parity seam. `--check` fails when the committed
// manifest is stale; yeaboi.ai's tests/unit/test_surface_parity.py reads the
// committed file (its own repo's copy) and never needs Node. The registry
// moved to src/renderer/lib/yeaboi/routes.json in the unified app; the
// manifest shape is unchanged (schema_version 2).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

const here = import.meta.dirname;
const source = resolve(here, '../src/renderer/lib/yeaboi/routes.json');
const target = resolve(here, '../contracts/v1/routes_manifest.json');

const registry = JSON.parse(readFileSync(source, 'utf-8'));
const rendered = `${JSON.stringify(registry, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const committed = readFileSync(target, 'utf-8');
  if (committed !== rendered) {
    console.error(
      `stale manifest: ${target}\nrun \`npm run gen-manifest\` and commit the result`,
    );
    exit(1);
  }
  console.log('routes manifest is current');
} else {
  writeFileSync(target, rendered);
  console.log(`wrote ${target}`);
}
