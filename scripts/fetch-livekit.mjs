#!/usr/bin/env node
// Stage the LiveKit server the packaged app runs, at resources/livekit/,
// shipped as extraResources. The sidecar (src/main/livekit.ts) spawns it
// with a config written at first run into ~/.yeaboi/livekit/livekit.yaml, so
// nothing else ships beside the binary.
//
// LiveKit's GitHub releases carry linux and windows binaries plus a
// checksums.txt — those targets download and verify against the release's
// own digests. There are NO darwin release assets (macOS is Homebrew or a
// source build), so darwin stages a locally installed binary — brew's, or
// --local-binary <path> — and records its version and sha256 in the bundle
// stamp instead.
//
// Usage:
//   node scripts/fetch-livekit.mjs [--platform darwin] [--arch arm64] [--local-binary <path>]
//   node scripts/fetch-livekit.mjs --check

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { argv, exit, platform as hostPlatform, arch as hostArch } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGE = join(ROOT, 'resources', 'livekit');
const CACHE = join(ROOT, '.livekit-cache');

const LK_VERSION = '1.13.6';
const LK_BASE = `https://github.com/livekit/livekit/releases/download/v${LK_VERSION}`;

/** `${platform}-${arch}` → release asset name; darwin has none upstream. */
const TARGETS = {
  'win32-x64': `livekit_${LK_VERSION}_windows_amd64.zip`,
  'linux-x64': `livekit_${LK_VERSION}_linux_amd64.tar.gz`,
  'linux-arm64': `livekit_${LK_VERSION}_linux_arm64.tar.gz`,
};

function parseArgs(input = argv.slice(2)) {
  const args = { platform: hostPlatform, arch: hostArch, check: false, localBinary: '' };
  for (let i = 0; i < input.length; i += 1) {
    const flag = input[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--platform') args.platform = input[(i += 1)] ?? '';
    else if (flag === '--arch') args.arch = input[(i += 1)] ?? '';
    else if (flag === '--local-binary') args.localBinary = input[(i += 1)] ?? '';
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

/** The release's own checksums.txt: `<sha256>  <asset>` per line. */
async function releaseDigest(asset) {
  const cachePath = join(CACHE, `checksums-${LK_VERSION}.txt`);
  if (!existsSync(cachePath)) await download(`${LK_BASE}/checksums.txt`, cachePath);
  const line = readFileSync(cachePath, 'utf8')
    .split('\n')
    .find((row) => row.trim().endsWith(asset));
  if (!line) throw new Error(`${asset} is not in the release's checksums.txt`);
  return line.trim().split(/\s+/)[0];
}

function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function stamp(payload) {
  writeFileSync(join(STAGE, 'livekit-bundle.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

function localServerPath(explicit) {
  if (explicit) return explicit;
  try {
    return execFileSync('sh', ['-c', 'command -v livekit-server'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function stage({ platform, arch, localBinary }) {
  const target = `${platform}-${arch}`;
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  if (platform === 'darwin') {
    const source = localServerPath(localBinary);
    if (!source || !existsSync(source)) {
      throw new Error(
        'no darwin release assets exist upstream — install livekit-server ' +
          '(brew install livekit) or pass --local-binary <path>',
      );
    }
    const binary = join(STAGE, 'livekit-server');
    copyFileSync(source, binary);
    chmodSync(binary, 0o755);
    const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
    stamp({ target, livekit: version, source, sha256: sha256Of(binary) });
    console.log(`staged ${version} from ${source}`);
    return;
  }

  const asset = TARGETS[target];
  if (!asset) throw new Error(`no livekit-server target for ${target}`);
  const digest = await releaseDigest(asset);
  const archive = join(CACHE, asset);
  if (!existsSync(archive) || sha256Of(archive) !== digest) {
    rmSync(archive, { force: true });
    console.log(`fetching ${asset}`);
    const got = await download(`${LK_BASE}/${asset}`, archive);
    if (got !== digest) {
      rmSync(archive);
      throw new Error(`checksum mismatch for ${asset}\n  expected ${digest}\n  got      ${got}`);
    }
  }
  execFileSync('tar', [asset.endsWith('.zip') ? '-xf' : '-xzf', archive, '-C', STAGE], {
    stdio: 'inherit',
  });
  const binary = join(STAGE, platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');
  if (!existsSync(binary)) throw new Error(`the archive unpacked without ${binary}`);
  if (platform === hostPlatform) execFileSync(binary, ['--version'], { stdio: 'inherit' });
  stamp({ target, livekit: LK_VERSION, sha256: digest });
}

function check({ platform, arch }) {
  const stampPath = join(STAGE, 'livekit-bundle.json');
  if (!existsSync(stampPath))
    throw new Error(`nothing staged at ${STAGE} — run without --check first`);
  const staged = JSON.parse(readFileSync(stampPath, 'utf8'));
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
