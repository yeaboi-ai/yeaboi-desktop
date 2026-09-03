// Where an unpackaged build looks for the yeaboi checkout that owns the Python.
//
// Pure so the sidecar's path guess can be tested without Electron.

import { resolve } from 'node:path';

/** Candidate checkouts, most specific first.
 *
 *  A worktree is `<checkout>/.claude/worktrees/<name>`, and the tooling cuts the
 *  same worktree name in every repo — so from inside one, the sibling of *this*
 *  tree is another worktree's directory, and the checkout to run is the matching
 *  worktree of yeaboi.ai. Development happens in worktrees here, so that is the
 *  common case rather than the exception. */
export function devRepoCandidates(root: string): string[] {
  const candidates: string[] = [];
  // The name is the rest of the path, not one segment: worktrees are cut by
  // branch name, and those carry slashes (`desktop/settings-page`).
  const worktree = /^(.*)[\\/]\.claude[\\/]worktrees[\\/](.+)$/.exec(root);
  if (worktree) {
    const checkout = worktree[1]!;
    const name = worktree[2]!;
    candidates.push(resolve(checkout, '../yeaboi.ai/.claude/worktrees', name));
    candidates.push(resolve(checkout, '../yeaboi-ai-main'));
    candidates.push(resolve(checkout, '../yeaboi.ai'));
  }
  // Both names the Python checkout goes by: `yeaboi.ai` is the repository,
  // `yeaboi-ai-main` is what an archive of it unpacks as. Whichever is beside
  // this one, with the archive name first — a machine that has both usually
  // has the archive because the clone is old.
  candidates.push(resolve(root, '../yeaboi-ai-main'));
  candidates.push(resolve(root, '../yeaboi.ai'));
  return candidates;
}
