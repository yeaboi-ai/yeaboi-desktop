#!/usr/bin/env node
// Stage the LiveKit server the packaged app runs: a pinned livekit-server
// release binary at resources/livekit/, shipped as extraResources. The
// sidecar (src/main/livekit.ts) spawns it with a config written at first run
// into ~/.yeaboi/livekit/livekit.yaml, so nothing else ships beside the
// binary.
//
// Same doctrine as fetch-runtimes.mjs: pinned version, pinned sha256 per
// target — the download is verifiable, not merely successful. Bumping the
// version means replacing every digest; the script prints what it actually
// got on a mismatch so the swap is mechanical.
//
// Usage:
//   node scripts/fetch-livekit.mjs [--platform darwin] [--arch arm64]
//   node scripts/fetch-livekit.mjs --check

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, exit, platform as hostPlatform, arch as hostArch } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGE = join(ROOT, 'resources', 'livekit');
const CACHE = join(ROOT, '.livekit-cache');

const LK_VERSION = '1.9.1';
const LK_BASE = `https://github.com/livekit/livekit/releases/download/v${LK_VERSION}`;

/** `${platform}-${arch}` → [release asset name, sha256].
 *  Digests are filled by running with YEABOI_LIVEKIT_TRUST_FIRST_FETCH=1 once
 *  per target and copying the printed value — the release publishes no
 *  checksums file for every asset shape, so the pin is established here. */
const TARGETS = {
  'darwin-arm64': [`livekit_${LK_VERSION}_darwin_arm64.tar.gz`, ''],
  'darwin-x64': [`livekit_${LK_VERSION}_darwin_amd64.tar.gz`, ''],
  'win32-x64': [`livekit_${LK_VERSION}_windows_amd64.zip`, ''],
  'linux-x64': [`livekit_${LK_VERSION}_linux_amd64.tar.gz`, ''],
  'linux-arm64': [`livekit_${LK_VERSION}_linux_arm64.tar.gz`, ''],
};

function parseArgs(input = argv.slice(2)) {
  const args = { platform: hostPlatform, arch: hostArch, check: false };
  for (let i = 0; i < input.length; i += 1) {
    const flag = input[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--platform') args.platform = input[(i += 1)] ?? '';
    else if (flag === '--arch') args.arch = input[(i += 1)] ?? '';
    else throw new Error(`unknown argument: ${flag}`);
  }
  return args;
}

async function download(url, into) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(into), { recursive: true });
  writeFileSync(into, body);
  return createHash('sha256').update(body).digest('hex');
}

async function stage({ platform, arch }) {
  const target = `${platform}-${arch}`;
  const [asset, digest] = TARGETS[target] ?? [];
  if (!asset) throw new Error(`no livekit-server target for ${target}`);

  const archive = join(CACHE, asset);
  if (!existsSync(archive)) {
    console.log(`fetching ${asset}`);
    const got = await download(`${LK_BASE}/${asset}`, archive);
    if (digest && got !== digest) {
      rmSync(archive);
      throw new Error(`checksum mismatch for ${asset}\n  expected ${digest}\n  got      ${got}`);
    }
    if (!digest) {
      if (process.env.YEABOI_LIVEKIT_TRUST_FIRST_FETCH !== '1') {
        rmSync(archive);
        throw new Error(
          `no pinned digest for ${target}. Fetched sha256: ${got}\n` +
            'Pin it in TARGETS, or set YEABOI_LIVEKIT_TRUST_FIRST_FETCH=1 to accept this one.',
        );
      }
      console.warn(`⚠ trusting first fetch for ${target}: sha256 ${got} — pin this in TARGETS`);
    }
  }

  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });
  if (asset.endsWith('.zip')) {
    execFileSync('tar', ['-xf', archive, '-C', STAGE], { stdio: 'inherit' });
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', STAGE], { stdio: 'inherit' });
  }

  const binary = join(STAGE, platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');
  if (!existsSync(binary)) throw new Error(`the archive unpacked without ${binary}`);
  if (platform === hostPlatform) {
    execFileSync(binary, ['--version'], { stdio: 'inherit' });
  }
  writeFileSync(
    join(STAGE, 'livekit-bundle.json'),
    `${JSON.stringify({ target, livekit: LK_VERSION }, null, 2)}\n`,
  );
}

function check({ platform, arch }) {
  const stamp = join(STAGE, 'livekit-bundle.json');
  if (!existsSync(stamp)) throw new Error(`nothing staged at ${STAGE} — run without --check first`);
  const staged = JSON.parse(readFileSync(stamp, 'utf8'));
  const target = `${platform}-${arch}`;
  if (staged.target !== target) throw new Error(`staged ${staged.target}, wanted ${target}`);
  console.log(`✓ ${target}: livekit-server ${staged.livekit}`);
}

async function main() {
  const args = parseArgs();
  if (args.check) check(args);
  else await stage(args);
}

if (process.argv[1] && process.argv[1].endsWith('fetch-livekit.mjs')) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    exit(1);
  });
}

export { TARGETS, LK_VERSION, parseArgs };
