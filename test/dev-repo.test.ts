// Where an unpackaged build looks for the Python that serves `yeaboi app`.
//
// Development here happens in worktrees, and a worktree's sibling is another
// worktree — not the yeaboi.ai checkout — so the plain sibling guess finds
// nothing and the spawn fails as `spawn uv ENOENT`, blaming uv for a missing
// directory.

import { describe, expect, it } from 'vitest';
import { devRepoCandidates } from '../src/shared/dev-repo';

describe('devRepoCandidates', () => {
  it('looks beside a plain checkout, under either name the Python goes by', () => {
    expect(devRepoCandidates('/Users/x/code/yeaboi-desktop')).toEqual([
      '/Users/x/code/yeaboi-ai-main',
      '/Users/x/code/yeaboi.ai',
    ]);
  });

  it('prefers the yeaboi worktree cut under the same name', () => {
    const candidates = devRepoCandidates(
      '/Users/x/code/yeaboi-desktop/.claude/worktrees/desktop/settings-page',
    );
    expect(candidates[0]).toBe('/Users/x/code/yeaboi.ai/.claude/worktrees/desktop/settings-page');
  });

  it('falls back to the yeaboi checkout itself, then the literal sibling', () => {
    const candidates = devRepoCandidates(
      '/Users/x/code/yeaboi-desktop/.claude/worktrees/desktop/settings-page',
    );
    expect(candidates).toContain('/Users/x/code/yeaboi.ai');
    // The sibling of a worktree — kept last, and the reason the guess used to
    // miss: it is a directory beside other worktrees, not a checkout.
    expect(candidates.at(-1)).toBe(
      '/Users/x/code/yeaboi-desktop/.claude/worktrees/desktop/yeaboi.ai',
    );
    expect(candidates).toContain('/Users/x/code/yeaboi-ai-main');
  });

  it('never offers the same path twice', () => {
    for (const root of [
      '/Users/x/code/yeaboi-desktop',
      '/Users/x/code/yeaboi-desktop/.claude/worktrees/desktop/settings-page',
    ]) {
      const candidates = devRepoCandidates(root);
      expect(new Set(candidates).size).toBe(candidates.length);
    }
  });
});
