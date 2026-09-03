// The Python sidecar: spawn `yeaboi app`, read the one handshake line, keep it
// alive, and take it down with us. The wire contract is contracts/v1/app_http.md
// — the handshake token lives ONLY in this process, never in a renderer.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { app } from 'electron';
import { devRepoCandidates } from '../shared/dev-repo';

export interface Handshake {
  url: string;
  token: string;
  pid: number;
  schema: number;
  version: string;
}

export type BackendState =
  { kind: 'starting' } | { kind: 'ready'; handshake: Handshake } | { kind: 'down'; reason: string };

const READY_PREFIX = 'YEABOI_APP_READY ';
const HANDSHAKE_TIMEOUT_MS = 20_000;
// Restart backoff: quick first retry, then slower; give up after MAX_RESTARTS
// inside RESTART_WINDOW_MS and stay "down" until the user intervenes.
const RESTART_DELAYS_MS = [1_000, 5_000, 15_000];
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60_000;

/** Python extras the desktop cannot run without: tool dispatch goes through
 *  the in-process MCP app, and the export paths write PDF and Office files. */
const DESKTOP_EXTRAS = ['mcp', 'pdf', 'docs'];

/** How to launch the backend. Resolution order (dev escape hatch first):
 *  1. $YEABOI_DESKTOP_PYTHON — an explicit interpreter; runs `-m yeaboi app`
 *  2. packaged: the bundled python in resources/py
 *  3. dev fallback: `uv run yeaboi app` in a yeaboi checkout
 *
 *  Throws when the dev fallback finds no checkout: spawning into a cwd that does
 *  not exist fails as `spawn uv ENOENT`, which blames the wrong thing.
 */
export function resolveCommand(): { command: string; args: string[]; cwd?: string } {
  const explicit = process.env['YEABOI_DESKTOP_PYTHON'];
  if (explicit) {
    return { command: explicit, args: ['-m', 'yeaboi', 'app'] };
  }
  if (app.isPackaged) {
    const python = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
    return {
      command: `${process.resourcesPath}/py/${python}`,
      args: ['-m', 'yeaboi', 'app'],
    };
  }
  // Unpackaged dev: drive a yeaboi checkout through uv. The Python lives in its
  // own repo now, so there is no working tree above this one to reach for —
  // $YEABOI_REPO names it, else it is looked for beside this checkout.
  const named = process.env['YEABOI_REPO'];
  const candidates = named ? [named] : devRepoCandidates(resolve(import.meta.dirname, '../..'));
  const repo = candidates.find((path) => existsSync(path));
  if (!repo) {
    throw new Error(
      `no yeaboi checkout to run the backend from. Looked in:\n  ${candidates.join('\n  ')}\n` +
        'Point YEABOI_REPO at a yeaboi.ai checkout, or YEABOI_DESKTOP_PYTHON at an ' +
        'interpreter that can import yeaboi.',
    );
  }
  // `uv run` syncs the checkout's environment to exactly what it is asked for,
  // so anything installed by hand is removed on the next launch. The desktop
  // needs the extras named here: the backend hosts the MCP app in-process to
  // serve tool calls, and Reporting writes PDF and Office files.
  const extras = DESKTOP_EXTRAS.flatMap((extra) => ['--extra', extra]);
  return { command: 'uv', args: ['run', ...extras, 'yeaboi', 'app'], cwd: repo };
}

export class Sidecar {
  private child: ChildProcess | null = null;
  private state: BackendState = { kind: 'starting' };
  private restarts: number[] = [];
  private stopping = false;
  private listeners = new Set<(state: BackendState) => void>();

  get current(): BackendState {
    return this.state;
  }

  get handshake(): Handshake | null {
    return this.state.kind === 'ready' ? this.state.handshake : null;
  }

  onState(listener: (state: BackendState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: BackendState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.setState({ kind: 'starting' });
    let launch;
    try {
      launch = resolveCommand();
    } catch (error) {
      // Nothing to spawn — a restart would resolve the same way, so stay down.
      this.setState({ kind: 'down', reason: (error as Error).message });
      return;
    }
    const { command, args, cwd } = launch;
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, YEABOI_DESKTOP: '1' },
    });
    this.child = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      // The backend logs to ~/.yeaboi/logs/app/; stderr is only startup noise
      // worth keeping for the error screen.
      console.error(`[yeaboi-app] ${chunk.toString().trimEnd()}`);
    });

    const handshake = await this.readHandshake(child).catch((error: Error) => {
      this.setState({ kind: 'down', reason: error.message });
      child.kill();
      return null;
    });
    if (handshake === null) return;

    this.setState({ kind: 'ready', handshake });

    child.on('exit', (code) => {
      this.child = null;
      if (this.stopping) return;
      // Another `yeaboi app` already owns the ~/.yeaboi lock, so this child
      // printed *that* instance's handshake and exited 0 by design. We are
      // pointed at a live backend; respawning only repeats the instant exit.
      if (code === 0 && handshake.pid !== child.pid) return;
      this.scheduleRestart(`backend exited with code ${String(code)}`);
    });
  }

  private readHandshake(child: ChildProcess): Promise<Handshake> {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no handshake within ${HANDSHAKE_TIMEOUT_MS / 1000}s`));
      }, HANDSHAKE_TIMEOUT_MS);
      const stdout = child.stdout;
      if (!stdout) {
        clearTimeout(timer);
        reject(new Error('backend has no stdout'));
        return;
      }
      const lines = createInterface({ input: stdout });
      lines.once('line', (line) => {
        clearTimeout(timer);
        if (!line.startsWith(READY_PREFIX)) {
          reject(new Error(`unexpected first line from backend: ${line.slice(0, 120)}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(line.slice(READY_PREFIX.length)) as Handshake);
        } catch {
          reject(new Error('malformed handshake JSON'));
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`could not spawn backend: ${error.message}`));
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`backend exited during startup (code ${String(code)})`));
      });
    });
  }

  private scheduleRestart(reason: string): void {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= MAX_RESTARTS) {
      this.setState({ kind: 'down', reason: `${reason} — too many restarts, giving up` });
      return;
    }
    const delay =
      RESTART_DELAYS_MS[Math.min(this.restarts.length, RESTART_DELAYS_MS.length - 1)] ?? 15_000;
    this.restarts.push(now);
    this.setState({ kind: 'down', reason: `${reason} — restarting in ${delay / 1000}s` });
    setTimeout(() => {
      if (!this.stopping) void this.start();
    }, delay);
  }

  /** Graceful stop: POST /api/shutdown, then SIGTERM, then SIGKILL. */
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    const handshake = this.handshake;
    if (handshake) {
      await fetch(`${handshake.url}/api/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${handshake.token}` },
      }).catch(() => undefined);
    }
    const exited = new Promise<void>((resolvePromise) =>
      child.once('exit', () => resolvePromise()),
    );
    child.kill('SIGTERM');
    const timeout = new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5_000));
    await Promise.race([exited, timeout]);
    if (this.child) this.child.kill('SIGKILL');
    this.child = null;
  }
}
