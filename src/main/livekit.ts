// The LiveKit server sidecar — the WebRTC SFU that voice/video calls run
// through, kept local so call media never has to leave the machine.
//
// Resolution order mirrors the Python sidecars: $YEABOI_DESKTOP_LIVEKIT →
// the bundled binary in resources/livekit → `livekit-server` on PATH. Before
// spawning, port 7880 is probed: a server already answering there (the
// planning-platform docker stack in dev) is adopted rather than fought over.
// No binary anywhere → 'down' with a reason; voice is optional and the rest
// of the app runs without it.
//
// The config is written to ~/.yeaboi/livekit/livekit.yaml on every start so
// the generated API keypair (secrets.ts) always matches what the planning
// backend mints tokens with. --node-ip carries the LAN address so teammates
// on the network can join; loopback when none is found.

import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { loadMachineSecrets, yeaboiHome } from './secrets';

export type LivekitState =
  | { kind: 'starting' }
  | { kind: 'ready'; url: string; external: boolean }
  | { kind: 'down'; reason: string };

const PORT = 7880;
const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 500;

/** First non-internal IPv4 — what LAN participants dial. Loopback otherwise. */
export function detectLanIp(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

function resolveBinary(): string {
  const explicit = process.env['YEABOI_DESKTOP_LIVEKIT'];
  if (explicit) return explicit;
  if (app.isPackaged) {
    const binary = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server';
    return `${process.resourcesPath}/livekit/${binary}`;
  }
  return 'livekit-server'; // PATH, in dev
}

function writeConfig(): string {
  const secrets = loadMachineSecrets();
  const dir = join(yeaboiHome(), 'livekit');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'livekit.yaml');
  // force_tcp keeps calls working on networks that eat UDP — same choice the
  // planning-platform dev compose makes.
  writeFileSync(
    path,
    [
      `port: ${PORT}`,
      'rtc:',
      '  tcp_port: 7881',
      '  udp_port: 7882',
      '  use_external_ip: false',
      '  force_tcp: true',
      'keys:',
      `  ${secrets.livekitApiKey}: ${secrets.livekitApiSecret}`,
      '',
    ].join('\n'),
  );
  return path;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

export class LivekitSidecar {
  private child: ChildProcess | null = null;
  private state: LivekitState = { kind: 'starting' };
  private stopping = false;
  private listeners = new Set<(state: LivekitState) => void>();

  get current(): LivekitState {
    return this.state;
  }

  onState(listener: (state: LivekitState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: LivekitState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.setState({ kind: 'starting' });
    const url = `ws://127.0.0.1:${PORT}`;

    // Adopt an already-answering server first (the dev docker stack, or an
    // earlier instance). An HTTP answer is the reliable signal — on macOS,
    // Docker's 0.0.0.0 port proxy lets a second 127.0.0.1 bind "succeed", so
    // a bind probe alone lies.
    const answering = await fetch(`http://127.0.0.1:${PORT}`, {
      signal: AbortSignal.timeout(1_000),
    }).then(
      () => true,
      () => false,
    );
    if (answering || !(await portFree(PORT))) {
      this.setState({ kind: 'ready', url, external: true });
      return;
    }
    if (!(await portFree(7881))) {
      // 7880 free but the RTC port taken — a half-visible LiveKit (a docker
      // container publishing only 7881/7882, say). Spawning would bind 7880
      // and then die on 7881; saying why beats a cryptic exit code 0.
      this.setState({
        kind: 'down',
        reason: 'port 7881 is in use by another LiveKit — stop it (e.g. the docker stack) to use the bundled server',
      });
      return;
    }

    const configPath = writeConfig();
    const binary = resolveBinary();
    const logFile = join(yeaboiHome(), 'logs', 'livekit.log');
    mkdirSync(join(yeaboiHome(), 'logs'), { recursive: true });

    const child = spawn(binary, ['--config', configPath, '--node-ip', detectLanIp()], {
      stdio: ['ignore', 'pipe', 'pipe'],
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

    const ready = await new Promise<boolean>((resolve) => {
      const deadline = Date.now() + READY_TIMEOUT_MS;
      let settled = false;
      const finish = (ok: boolean, reason = '') => {
        if (settled) return;
        settled = true;
        if (!ok) this.setState({ kind: 'down', reason });
        resolve(ok);
      };
      child.once('error', (error) =>
        finish(false, `livekit-server not available (${error.message}) — voice calls disabled`),
      );
      child.once('exit', (code) =>
        finish(false, `livekit-server exited during startup (code ${String(code)})`),
      );
      const poll = async () => {
        if (settled) return;
        if (Date.now() > deadline) {
          finish(false, `livekit-server gave no answer on :${PORT} within 20s`);
          return;
        }
        try {
          const response = await fetch(`http://127.0.0.1:${PORT}`, {
            signal: AbortSignal.timeout(1_500),
          });
          if (response.status > 0) {
            finish(true);
            return;
          }
        } catch {
          /* not up yet */
        }
        setTimeout(() => void poll(), POLL_MS);
      };
      void poll();
    });
    if (!ready) {
      child.kill();
      this.child = null;
      return;
    }

    this.setState({ kind: 'ready', url, external: false });
    child.on('exit', (code) => {
      this.child = null;
      if (!this.stopping)
        this.setState({ kind: 'down', reason: `livekit-server exited (code ${String(code)})` });
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3_000))]);
    if (this.child) this.child.kill('SIGKILL');
    this.child = null;
  }
}
