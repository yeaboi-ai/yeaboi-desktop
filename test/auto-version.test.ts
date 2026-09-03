// How a release-worthy PR gets its version: auto-version.yml bumps the PR
// branch, and release.yml ships whatever main holds on the merge. Everything
// here fails somewhere expensive otherwise — a bump that lands on main, a
// ledger entry the format gate rejects, an area the What's New page cannot
// colour — after the LLM step has already spent its turns.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SHELL_AREA_ACCENTS } from '../src/renderer/lib/yeaboi/shell-changelog';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

const text = read('.github/workflows/auto-version.yml');
const workflow = parse(text);
const job = workflow.jobs.bump;
const steps: {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}[] = job.steps;
const step = (name: string) => {
  const found = steps.find((s) => s.name === name || s.id === name);
  if (!found) throw new Error(`no step ${name}`);
  return found;
};
const prompt: string = step('claude').with!.prompt;

describe('when it runs', () => {
  it('on a pull request to main, and never on a push', () => {
    // A push trigger would put the bump commit on main itself, where nothing
    // reviews it and release.yml would ship it immediately.
    expect(Object.keys(workflow.on)).toEqual(['pull_request']);
    expect(workflow.on.pull_request.branches).toEqual(['main']);
    expect(workflow.on.pull_request.types).toContain('labeled');
  });

  it('only for a branch of this repository', () => {
    expect(job.if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  });

  it('once per PR at a time, dropping the run a newer push made stale', () => {
    expect(workflow.concurrency.group).toContain('github.event.pull_request.number');
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
  });

  it('carries the id-token the action exchanges for its own push identity', () => {
    // The Claude App token is what pushes the bump, so the commit's CI runs as
    // a normal push and the required checks can still go green on it. No PAT
    // is involved and none should be re-introduced from the Python repo's copy.
    expect(job.permissions['id-token']).toBe('write');
    expect(job.permissions.contents).toBe('write');
    expect(text).not.toContain('AUTO_VERSION_PAT');
  });
});

describe('the deterministic guards', () => {
  const guard = step('guard').run!;

  it('compare the version against the merge-base, not the base tip', () => {
    expect(guard).toContain('git merge-base FETCH_HEAD HEAD');
    expect(guard).toContain('git show "$MERGE_BASE:package.json"');
    expect(guard).toContain('jq -r .version package.json');
  });

  it('skip only when the ledger already carries the bumped version', () => {
    expect(guard).toContain('any(.entries[]; .version == $v)');
    expect(guard).toContain('changelog_only=true');
  });

  it('let a label force the decision', () => {
    for (const label of [
      'semver:major',
      'semver:minor',
      'semver:patch',
      'semver:none',
      'release:skip',
    ]) {
      expect(guard).toContain(label);
    }
  });

  it('count only paths that ship, and never the ledger itself', () => {
    // A local merge-base diff, so the list is exact whatever the PR's size.
    expect(guard).toContain('git diff --name-only FETCH_HEAD...HEAD');
    const filter = guard.match(/grep -E '(\^\(.*\))'/)?.[1] ?? '';
    for (const shipped of [
      'src/',
      'backend/',
      'build/',
      'resources/',
      'electron-builder\\.yml',
      'package-lock\\.json',
      'scripts/fetch-',
    ]) {
      expect(filter).toContain(shipped);
    }
    expect(guard).toContain(
      "grep -vE '^(src/renderer/lib/yeaboi/shell-changelog\\.json$|backend/tests/)'",
    );
  });

  it('gate every later step', () => {
    for (const s of steps.slice(steps.indexOf(step('guard')) + 1)) {
      if (s.name === 'Explain an auth failure') continue;
      expect(s.if, s.name ?? s.uses).toContain("steps.guard.outputs.skip == 'false'");
    }
  });
});

describe('the bump the LLM applies', () => {
  it('is the script, which exists, and never the package manager', () => {
    expect(prompt).toContain('node scripts/bump-version.mjs <level>');
    expect(existsSync(resolve(ROOT, 'scripts/bump-version.mjs'))).toBe(true);
    expect(text).not.toContain('npm version');
  });

  it('is limited to the three files a release is made of', () => {
    const files = [
      'package.json',
      'package-lock.json',
      'src/renderer/lib/yeaboi/shell-changelog.json',
    ];
    const rules = prompt.slice(prompt.lastIndexOf('Rules:'));
    for (const file of files) expect(rules).toContain(file);
    expect(rules).toContain('never bump more than once');
  });

  it("names exactly the areas the What's New page can colour", () => {
    // An area outside SHELL_AREA_ACCENTS renders with no accent and fails
    // test/shell-changelog.test.ts — after the turns were spent.
    const vocabulary = prompt.match(/fixed vocabulary: ([a-z, ]+)\./)?.[1].split(', ') ?? [];
    expect(vocabulary.sort()).toEqual(Object.keys(SHELL_AREA_ACCENTS).sort());
    expect(prompt).toContain('no "surfaces" key');
  });

  it('states the copy contract the ledger test enforces', () => {
    expect(prompt).toContain('AT MOST 60 characters');
    expect(prompt).toContain('AT MOST 240 characters');
    expect(prompt).toContain('AT MOST 90 characters');
    expect(prompt).toContain('GitHub, DevOps, PyPI, JetBrains, OpenAI, JavaScript, TypeScript');
  });

  it('formats the ledger and runs its test before pushing', () => {
    // The ledger does not round-trip through JSON.stringify, and CI's format
    // gate is a required check: an unformatted entry blocks the merge.
    const format = prompt.indexOf(
      'npx prettier --write src/renderer/lib/yeaboi/shell-changelog.json',
    );
    const test = prompt.indexOf('npx vitest run test/shell-changelog.test.ts');
    const push = prompt.indexOf('and push');
    expect(format).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(format);
    expect(push).toBeGreaterThan(test);
  });

  it('commits under the trailer this repo uses', () => {
    expect(prompt).toContain('chore: bump version to <new-version> [auto]');
    expect(prompt).toContain('Co-Authored-By: Claude <noreply@anthropic.com>');
  });

  it('runs the pinned action with a bounded tool set', () => {
    const claude = step('claude');
    expect(claude.uses).toMatch(/^anthropics\/claude-code-action@[0-9a-f]{40}/);
    expect(claude.with!.claude_args).toContain('--allowedTools "Bash,Read,Edit,Write"');
    expect(claude.with!.claude_args).toContain('--max-turns');
  });
});
