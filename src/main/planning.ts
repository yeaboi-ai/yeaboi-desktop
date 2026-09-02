// The planning-platform FastAPI sidecar — the desktop's second Python
// backend, run in local mode: SQLite under ~/.yeaboi/planning, no Redis, no
// probes, loopback only. The renderer talks to it directly with minted JWTs
// (unlike the yeaboi-app sidecar, whose token never leaves main), so all this
// process owns is the lifecycle: spawn, health, backoff, teardown.
//
// Same restart discipline as sidecar.ts: quick first retry, then slower,
// give up after MAX_RESTARTS inside the window.

import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { app } from 'electron';
import { corsOrigins, planningPortRange } from '../shared/csp';
import { loadMachineSecrets, loadSharedEnv, yeaboiHome } from './secrets';

export type PlanningState =
  { kind: 'starting' } | { kind: 'ready'; url: string } | { kind: 'down'; reason: string };

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 500;
const RESTART_DELAYS_MS = [1_000, 5_000, 15_000];
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60_000;

/** How to launch the backend. Resolution order (dev escape hatch first):
 *  1. $YEABOI_DESKTOP_PLANNING_PYTHON — an explicit interpreter
 *  2. packaged: the bundled python in resources/py-planning
 *  3. dev fallback: `uv run uvicorn` in the vendored backend/ tree
 *     ($YEABOI_PLANNING_REPO points elsewhere for a separate checkout)
 */
export function resolvePlanningCommand(port: number): {
  command: string;
  args: string[];
  cwd?: string;
} {
  // The wheel installs the API as `app`; only the repo checkout spells it
  // `src.app` (backend/ as cwd, src/ as a namespace dir).
  const uvicornArgs = (module_: string) => [
    'uvicorn',
    `${module_}:create_app`,
    '--factory',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];
  const explicit = process.env['YEABOI_DESKTOP_PLANNING_PYTHON'];
  if (explicit) {
    return { command: explicit, args: ['-m', ...uvicornArgs('app.main')] };
  }
  if (app.isPackaged) {
    const python = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
    return {
      command: `${process.resourcesPath}/py-planning/${python}`,
      args: ['-m', ...uvicornArgs('app.main')],
    };
  }
  const repo = process.env['YEABOI_PLANNING_REPO'] ?? resolve(import.meta.dirname, '../../backend');
  return { command: 'uv', args: ['run', ...uvicornArgs('src.app.main')], cwd: repo };
}

/** The env a local-mode planning backend runs under: the shared ~/.yeaboi/.env
 *  keys first, then the machine secrets and the local-profile switches on top
 *  (env only, never argv — argv is visible in `ps`). */
export function planningEnv(port: number): Record<string, string> {
  const home = yeaboiHome();
  const secrets = loadMachineSecrets();
  const shared = loadSharedEnv();
  return {
    ...process.env,
    ...shared,
    CORS_ORIGINS: corsOrigins(
      shared['CORS_ORIGINS'] ?? process.env['CORS_ORIGINS'],
      process.env['ELECTRON_RENDERER_URL'],
    ),
    YEABOI_LOCAL_MODE: '1',
    YEABOI_HOME: home,
    DATABASE_URL: `sqlite+aiosqlite:///${join(home, 'planning', 'planning.db')}`,
    UPLOAD_DIR: join(home, 'planning', 'uploads'),
    REDIS_ENABLED: 'false',
    PROBES_ENABLED: 'false',
    NEXTAUTH_SECRET: secrets.nextauthSecret,
    INTERNAL_API_SECRET: secrets.internalApiSecret,
    AI_KEY_ENCRYPTION_SECRET: secrets.aiKeyEncryptionSecret,
    LIVEKIT_API_KEY: secrets.livekitApiKey,
    LIVEKIT_API_SECRET: secrets.livekitApiSecret,
    BACKEND_URL: `http://127.0.0.1:${port}`,
  } as Record<string, string>;
}

function firstFreePort(candidates: readonly number[]): Promise<number> {
  const probe = (port: number) =>
    new Promise<boolean>((resolvePromise) => {
      const server = createServer();
      server.once('error', () => resolvePromise(false));
      server.once('listening', () => server.close(() => resolvePromise(true)));
      server.listen(port, '127.0.0.1');
    });
  return (async () => {
    for (const port of candidates) {
      if (await probe(port)) return port;
    }
    throw new Error(`no free port in ${candidates[0]}-${candidates[candidates.length - 1]}`);
  })();
}

export class PlanningSidecar {
  private child: ChildProcess | null = null;
  private state: PlanningState = { kind: 'starting' };
  private restarts: number[] = [];
  private stopping = false;
  private listeners = new Set<(state: PlanningState) => void>();
  private logFile = '';

  get current(): PlanningState {
    return this.state;
  }

  get url(): string | null {
    return this.state.kind === 'ready' ? this.state.url : null;
  }

  onState(listener: (state: PlanningState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: PlanningState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.setState({ kind: 'starting' });
    let port: number;
    try {
      port = await firstFreePort(planningPortRange());
    } catch (error) {
      this.setState({ kind: 'down', reason: (error as Error).message });
      return;
    }
    const url = `http://127.0.0.1:${port}`;
    // The renderer reaches this backend through settings.apiUrl, which reads
    // $YEABOI_API_URL first — publish the bound port there as soon as it is
    // chosen, so a token minted during startup already carries the right URL.
    // An externally set YEABOI_API_URL means "don't spawn" and never gets here.
    process.env['YEABOI_API_URL'] = url;
    const { command, args, cwd } = resolvePlanningCommand(port);

    const logDir = join(yeaboiHome(), 'logs');
    mkdirSync(logDir, { recursive: true });
    this.logFile = join(logDir, 'planning-api.log');

    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: planningEnv(port),
    });
    this.child = child;

    const log = (chunk: Buffer) => {
      try {
        appendFileSync(this.logFile, chunk);
      } catch {
        /* a full disk must not kill the supervisor */
      }
    };
    child.stdout?.on('data', log);
    child.stderr?.on('data', log);

    const ready = await this.waitHealthy(child, url).catch((error: Error) => {
      this.setState({ kind: 'down', reason: error.message });
      child.kill();
      return false;
    });
    if (!ready) return;

    this.setState({ kind: 'ready', url });

    child.on('exit', (code) => {
      this.child = null;
      if (this.stopping) return;
      this.scheduleRestart(`planning backend exited with code ${String(code)}`);
    });
  }

  private waitHealthy(child: ChildProcess, url: string): Promise<boolean> {
    return new Promise((resolvePromise, reject) => {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      let settled = false;
      const finish = (ok: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolvePromise(ok);
      };
      child.once('error', (error) => finish(false, new Error(`could not spawn: ${error.message}`)));
      child.once('exit', (code) =>
        finish(
          false,
          new Error(`exited during startup (code ${String(code)}) — see ${this.logFile}`),
        ),
      );
      const poll = async () => {
        if (settled) return;
        if (Date.now() > deadline) {
          finish(false, new Error(`no /api/health within ${HEALTH_TIMEOUT_MS / 1000}s`));
          return;
        }
        try {
          const response = await fetch(`${url}/api/health`, {
            signal: AbortSignal.timeout(2_000),
          });
          if (response.ok) {
            finish(true);
            return;
          }
        } catch {
          /* not up yet */
        }
        setTimeout(() => void poll(), HEALTH_POLL_MS);
      };
      void poll();
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

  /** Graceful stop: SIGTERM (uvicorn drains), then SIGKILL. */
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
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
