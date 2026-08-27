// The voice pack: the LiveKit agent worker's ~200MB dependency stack,
// installed on demand into ~/.yeaboi/voice-agent/site rather than shipped in
// the signed bundle — the same design as the TUI's voice_install.py: wheels
// only (a compile at install time is a hang on half the machines), additive
// (--target, never touching the bundled runtime), progress by byte count,
// and downloaded code under the user's home where signing doesn't care.
//
// Once installed, the worker runs as the fourth sidecar: the bundled
// planning python with PYTHONPATH pointed at the pack, `-m agent.worker`.

import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';
import { resolvePlanningCommand, planningEnv } from './planning';
import { loadMachineSecrets, loadSharedEnv, yeaboiHome } from './secrets';

const SITE = () => join(yeaboiHome(), 'voice-agent', 'site');

/** The bundled planning interpreter — also what pip runs under. */
function planningPython(): string {
  const explicit = process.env['YEABOI_DESKTOP_PLANNING_PYTHON'];
  if (explicit) return explicit;
  if (app.isPackaged) {
    const python = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
    return `${process.resourcesPath}/py-planning/${python}`;
  }
  // Dev has the repo venv with everything already — no pack needed.
  return '';
}

/** The staged backend wheel the pack installs `[voice]` from. */
function stagedWheel(): string {
  if (!app.isPackaged) return '';
  const dir = `${process.resourcesPath}/py-planning`;
  try {
    const wheel = readdirSync(dir).find((name) => name.endsWith('.whl'));
    return wheel ? join(dir, wheel) : '';
  } catch {
    return '';
  }
}

export function voicePackInstalled(): boolean {
  if (!app.isPackaged) return true; // the dev venv carries the voice extra
  return existsSync(join(SITE(), 'livekit', 'agents'));
}

export function registerVoicePack(): void {
  ipcMain.handle('voice-pack:state', () => ({
    installed: voicePackInstalled(),
    available: Boolean(planningPython() && stagedWheel()) || !app.isPackaged,
  }));

  ipcMain.handle('voice-pack:install', async (event) => {
    if (!app.isPackaged) return { ok: true, note: 'dev environment already has the voice extra' };
    const python = planningPython();
    const wheel = stagedWheel();
    if (!python || !wheel) return { ok: false, error: 'no bundled runtime/wheel to install from' };
    mkdirSync(SITE(), { recursive: true });
    return await new Promise((resolve) => {
      const child = spawn(
        python,
        ['-m', 'pip', 'install', '--only-binary=:all:', '--target', SITE(), `${wheel}[voice]`],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const relay = (chunk: Buffer) => {
        if (!event.sender.isDestroyed()) event.sender.send('voice-pack:progress', chunk.toString());
      };
      child.stdout?.on('data', relay);
      child.stderr?.on('data', relay);
      child.on('error', (error) => resolve({ ok: false, error: error.message }));
      child.on('exit', (code) =>
        resolve(
          code === 0 ? { ok: true } : { ok: false, error: `pip exited with code ${String(code)}` },
        ),
      );
    });
  });
}

/** The LiveKit agent worker — the facilitator's ears, brain and voice.
 *  Optional: only spawned when the pack is installed and LiveKit is up. */
export class VoiceAgentSidecar {
  private child: ChildProcess | null = null;
  private stopping = false;

  get running(): boolean {
    return this.child !== null;
  }

  start(planningUrl: string): void {
    if (this.child) return;
    this.stopping = false;
    const secrets = loadMachineSecrets();
    let command: string;
    let args: string[];
    let cwd: string | undefined;
    if (app.isPackaged) {
      command = planningPython();
      args = ['-m', 'agent.worker', 'start'];
    } else {
      // Dev: the sibling repo's venv, same resolution as the API sidecar.
      const resolved = resolvePlanningCommand(0);
      command = resolved.command;
      args = ['run', 'python', '-m', 'agent.worker', 'dev'];
      cwd = resolved.cwd;
    }
    const logFile = join(yeaboiHome(), 'logs', 'voice-agent.log');
    mkdirSync(join(yeaboiHome(), 'logs'), { recursive: true });
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...planningEnv(Number(new URL(planningUrl).port)),
        ...loadSharedEnv(),
        PYTHONPATH: app.isPackaged ? SITE() : '',
        LIVEKIT_URL: 'ws://127.0.0.1:7880',
        LIVEKIT_API_KEY: secrets.livekitApiKey,
        LIVEKIT_API_SECRET: secrets.livekitApiSecret,
        BACKEND_URL: planningUrl,
        INTERNAL_API_SECRET: secrets.internalApiSecret,
        AGENT_NAME: 'planning-facilitator',
      } as Record<string, string>,
    });
    this.child = child;
    const log = (chunk: Buffer) => {
      try {
        appendFileSync(logFile, chunk);
      } catch {
        /* ignore */
      }
    };
    child.stdout?.on('data', log);
    child.stderr?.on('data', log);
    child.on('exit', () => {
      this.child = null;
      if (!this.stopping) console.warn('[voice-agent] exited');
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
    if (this.child) this.child.kill('SIGKILL');
    this.child = null;
  }
}
