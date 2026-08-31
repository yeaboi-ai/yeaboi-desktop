// Render the GitHub release notes for the current app version.
//
// The notes are the head entry of the shell ledger — the same entry the
// What's New page shows — plus one line naming the yeaboi wheel the build
// bundles. The release workflow refuses to run when package.json and the
// ledger head disagree, so by the time this renders, the head entry IS this
// release's notes.
//
//   node scripts/release-notes.mjs [--wheel X.Y.Z]
//
// Prints markdown to stdout; --wheel adds the bundle line (the workflow passes
// it, a local eyeball run can skip it).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const ledger = JSON.parse(
  readFileSync(resolve(root, 'src/renderer/lib/yeaboi/shell-changelog.json'), 'utf8'),
);

const head = ledger.entries?.[0];
if (!head || !head.version || !head.summary) {
  console.error('release-notes: shell-changelog.json has no usable head entry');
  process.exit(1);
}
if (head.version !== pkg.version) {
  console.error(
    `release-notes: ledger head is ${head.version} but package.json says ${pkg.version} — ` +
      'every release ships its notes',
  );
  process.exit(1);
}

const wheelFlag = process.argv.indexOf('--wheel');
const wheel = wheelFlag !== -1 ? process.argv[wheelFlag + 1] : '';

const lines = head.headline ? [`**${head.headline}**`, '', head.summary, ''] : [head.summary, ''];
for (const highlight of head.highlights ?? []) {
  lines.push(`- ${highlight.text}`);
}
if (wheel) {
  lines.push('', `Bundles yeaboi.ai ${wheel} — see its release notes for what changed there.`);
}
process.stdout.write(lines.join('\n') + '\n');
