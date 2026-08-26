// Build the app, and fail on the warnings a build is allowed to survive.
//
// `@yeaboi-ai/design@1.0.0` published `fonts.css` without the three faces it
// names. Vite's response is a warning and a successful build — the renderer
// simply falls back to the system font stack, on every installed copy, forever.
// `npm run build` exits 0, `npm test` never builds, and CI saw neither.
//
// Anything a bundler reports as unresolved is in that category: it is a runtime
// hole dressed as a note. Grep for it and exit non-zero.

import { spawnSync } from 'node:child_process';

const FATAL = [
  // A `url()` or import the bundler could not find. Vite leaves it in the output
  // to be "resolved at runtime", where there is nothing to resolve it.
  {
    pattern: /didn't resolve at build time/,
    why: 'an asset the bundle references is not installed',
  },
  { pattern: /Failed to resolve import/, why: 'a module specifier resolves to nothing' },
];

const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
const output = `${build.stdout ?? ''}${build.stderr ?? ''}`;
process.stdout.write(output);

if (build.status !== 0) process.exit(build.status ?? 1);

const found = FATAL.flatMap(({ pattern, why }) =>
  output
    .split('\n')
    .filter((line) => pattern.test(line))
    .map((line) => `  ${line.trim()}\n    → ${why}`),
);

if (found.length) {
  console.error(`\n✗ the build succeeded but reported ${found.length} unresolved reference(s):\n`);
  console.error(found.join('\n'));
  console.error('\nA bundler warning here is a hole in the shipped app, not a note.');
  process.exit(1);
}

console.log('✓ the build resolved everything it references');
