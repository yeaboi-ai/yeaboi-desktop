// scripts/dev-preflight.sh — the guard that keeps `make dev` off a stale
// yeaboi.ai checkout, and now fast-forwards it rather than printing a command.
//
// Every case runs the real script against real throwaway repositories: what is
// under test is git's behaviour (what a fast-forward refuses, what a bare flag
// breaks), and a mock of that would only assert the mock.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../scripts/dev-preflight.sh');

/** Git env with every inherited GIT_* dropped — a hook's GIT_DIR would aim
 *  these commands at the real repository regardless of -C. The two switches the
 *  script itself reads go with them: a developer who exports either (repo-notes
 *  tells them to) would otherwise run a different script than CI does. */
function gitEnv(home: string): NodeJS.ProcessEnv {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  );
  return {
    ...clean,
    HOME: home,
    GIT_CONFIG_GLOBAL: resolve(home, '.gitconfig'),
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_TERMINAL_PROMPT: '0',
    YEABOI_DESKTOP_PYTHON: undefined,
    YEABOI_DEV_STALE_OK: undefined,
  };
}

const worlds: string[] = [];

interface World {
  dir: string;
  repo: string;
  seed: string;
  env: NodeJS.ProcessEnv;
  git: (cwd: string, ...args: string[]) => string;
  /** Commit `files` on the seed clone and push — leaves `repo` that far behind. */
  advance: (message: string, files: Record<string, string>) => void;
  /** Run the preflight; returns its exit code and stderr instead of throwing. */
  run: (options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => { code: number; stderr: string };
}

/** An origin, a `yeaboi.ai` clone of it, and a seed clone to push new work from. */
function makeWorld(): World {
  const dir = mkdtempSync(resolve(tmpdir(), 'preflight-'));
  worlds.push(dir);
  const home = resolve(dir, 'home');
  mkdirSync(home);
  const env = gitEnv(home);
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }).trim();

  const origin = resolve(dir, 'origin.git');
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origin], { env });
  // init + remote, not clone: cloning an empty origin warns on every world.
  const seed = resolve(dir, 'seed');
  execFileSync('git', ['init', '--quiet', '-b', 'main', seed], { env });
  git(seed, 'remote', 'add', 'origin', origin);
  writeFileSync(resolve(seed, 'uv.lock'), 'version = "1.0.0"\n');
  writeFileSync(resolve(seed, 'app.txt'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '--quiet', '-m', 'one');
  git(seed, 'push', '--quiet', 'origin', 'main');

  const repo = resolve(dir, 'yeaboi.ai');
  execFileSync('git', ['clone', '--quiet', origin, repo], { env });

  return {
    dir,
    repo,
    seed,
    env,
    git,
    advance(message, files) {
      for (const [name, body] of Object.entries(files)) writeFileSync(resolve(seed, name), body);
      git(seed, 'add', '-A');
      git(seed, 'commit', '--quiet', '-m', message);
      git(seed, 'push', '--quiet', 'origin', 'main');
    },
    run(options = {}) {
      // spawnSync, not execFileSync: everything this script says it says on
      // stderr, and execFileSync hands back only stdout.
      const result = spawnSync('bash', [SCRIPT], {
        cwd: options.cwd ?? dir,
        env: { ...env, TMPDIR: dir, YEABOI_REPO: repo, ...options.env },
        encoding: 'utf8',
      });
      return { code: result.status ?? -1, stderr: result.stderr };
    },
  };
}

afterEach(() => {
  for (const dir of worlds.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('dev-preflight', () => {
  it('is silent when the checkout is already current', () => {
    const world = makeWorld();
    const result = world.run();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('fast-forwards a stale checkout instead of printing a command', () => {
    const world = makeWorld();
    world.advance('two', { 'app.txt': 'two\n' });
    const result = world.run();
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('fast-forwarded');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).toBe(
      world.git(world.seed, 'rev-parse', 'HEAD'),
    );
  });

  it('heals a stray core.bare before touching the checkout', () => {
    const world = makeWorld();
    world.advance('two', { 'app.txt': 'two\n' });
    world.git(world.repo, 'config', 'core.bare', 'true');
    const result = world.run();
    expect(result.code).toBe(0);
    expect(world.git(world.repo, 'config', '--get', 'core.bare')).toBe('false');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).toBe(
      world.git(world.seed, 'rev-parse', 'HEAD'),
    );
  });

  it('sets aside a regenerated lockfile that blocks the fast-forward', () => {
    const world = makeWorld();
    world.advance('two', { 'uv.lock': 'version = "2.0.0"\n' });
    writeFileSync(resolve(world.repo, 'uv.lock'), 'version = "1.0.1"\n');
    const result = world.run();
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('set aside uv.lock');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).toBe(
      world.git(world.seed, 'rev-parse', 'HEAD'),
    );
    expect(readFileSync(resolve(world.repo, 'uv.lock'), 'utf8')).toBe('version = "2.0.0"\n');

    const backup = result.stderr.match(/copy in (\S+)/)?.[1];
    expect(backup).toBeTruthy();
    expect(readFileSync(resolve(backup!, 'uv.lock'), 'utf8')).toBe('version = "1.0.1"\n');
  });

  it('refuses, and eats nothing, when real work is in the way', () => {
    const world = makeWorld();
    world.advance('two', { 'app.txt': 'two\n' });
    writeFileSync(resolve(world.repo, 'app.txt'), 'mine\n');
    const result = world.run();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('could not fast-forward');
    expect(result.stderr).toContain('YEABOI_DEV_STALE_OK=1');
    expect(readFileSync(resolve(world.repo, 'app.txt'), 'utf8')).toBe('mine\n');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).not.toBe(
      world.git(world.seed, 'rev-parse', 'HEAD'),
    );
  });

  it('leaves the checkout alone under YEABOI_DEV_STALE_OK', () => {
    const world = makeWorld();
    const before = world.git(world.repo, 'rev-parse', 'HEAD');
    world.advance('two', { 'app.txt': 'two\n' });
    const result = world.run({ env: { YEABOI_DEV_STALE_OK: '1' } });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('running against the stale backend');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('leaves a dirty file the incoming commits do not touch alone', () => {
    const world = makeWorld();
    world.advance('two', { 'app.txt': 'two\n' });
    writeFileSync(resolve(world.repo, 'uv.lock'), 'version = "1.0.1"\n');
    const result = world.run();
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('set aside');
    expect(readFileSync(resolve(world.repo, 'uv.lock'), 'utf8')).toBe('version = "1.0.1"\n');
  });

  it('discards nothing when the history has diverged', () => {
    // The merge cannot land whatever is cleared away, so clearing anything is
    // pure loss.
    const world = makeWorld();
    world.advance('two', { 'uv.lock': 'version = "2.0.0"\n' });
    writeFileSync(resolve(world.repo, 'app.txt'), 'local\n');
    world.git(world.repo, 'commit', '--quiet', '-am', 'a commit of my own');
    writeFileSync(resolve(world.repo, 'uv.lock'), 'version = "1.0.1"\n');

    const result = world.run();
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain('set aside');
    expect(readFileSync(resolve(world.repo, 'uv.lock'), 'utf8')).toBe('version = "1.0.1"\n');
  });

  it('reports a deleted lockfile instead of dying on it', () => {
    // Nothing to copy aside: the set-aside must decline it, not crash on the cp.
    const world = makeWorld();
    world.advance('two', { 'uv.lock': 'version = "2.0.0"\n' });
    world.git(world.repo, 'rm', '--quiet', '--cached', 'uv.lock');
    rmSync(resolve(world.repo, 'uv.lock'));

    const result = world.run();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('could not fast-forward');
  });

  it('does nothing at all when an interpreter is named outright', () => {
    const world = makeWorld();
    const before = world.git(world.repo, 'rev-parse', 'HEAD');
    world.advance('two', { 'app.txt': 'two\n' });
    const result = world.run({ env: { YEABOI_DESKTOP_PYTHON: '/usr/bin/python3' } });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(world.git(world.repo, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('resolves a sibling worktree, whose .git is a file, not a directory', () => {
    const world = makeWorld();
    // The layout `make dev` runs in: a desktop worktree beside yeaboi.ai's
    // worktree of the same name, whose branch is then what the check reports.
    world.git(
      world.repo,
      'worktree',
      'add',
      '--quiet',
      '-b',
      'feat',
      resolve(world.repo, '.claude/worktrees/feat'),
    );
    const here = resolve(world.dir, 'yeaboi-desktop/.claude/worktrees/feat');
    mkdirSync(here, { recursive: true });
    const result = world.run({ cwd: here, env: { YEABOI_REPO: '' } });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("on 'feat'");
  });
});
