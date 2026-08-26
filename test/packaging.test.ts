// How the app is packaged, signed and shipped.
//
// Everything here fails in the same expensive place otherwise: a three-OS signed
// build, twenty minutes in, or — worse — an installed app that starts with no
// backend because the bundled Python landed somewhere the sidecar does not look.
// None of it needs electron-builder or a certificate to check.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

const builder = parse(read('electron-builder.yml'));
const releaseText = read('.github/workflows/release.yml');
const release = parse(releaseText);

describe('the python bundle lands where the sidecar looks', () => {
  // `sidecar.ts` spawns `<resourcesPath>/py/bin/python3`. Three files have to
  // agree on that path, and nothing at build time notices when they stop.

  it('the stage is shipped as an extra resource named py', () => {
    expect(builder.extraResources).toContainEqual({ from: 'resources/py', to: 'py' });
  });

  it('the stage is excluded from the asar', () => {
    // An executable inside an asar cannot be spawned; packing it there would
    // also double the app's size, silently.
    expect(builder.files).toContain('!resources/py/**');
  });

  it('the staging script writes into that stage', () => {
    expect(read('scripts/fetch-python.mjs')).toContain("join(ROOT, 'resources', 'py')");
  });

  it('the sidecar spawns it from resources', () => {
    const sidecar = read('src/main/sidecar.ts');
    expect(sidecar).toContain('${process.resourcesPath}/py/${python}');
    expect(sidecar).toContain("'bin/python3'");
    expect(sidecar).toContain("'python.exe'");
  });
});

describe('signing', () => {
  it('the hardened runtime is on and notarized', () => {
    expect(builder.mac.hardenedRuntime).toBe(true);
    expect(builder.mac.notarize).toBe(true);
  });

  it.each(['entitlements.mac.plist', 'entitlements.mac.inherit.plist'])(
    '%s exists and is referenced',
    (name) => {
      expect(read(`build/${name}`)).toBeTruthy();
      expect([builder.mac.entitlements, builder.mac.entitlementsInherit]).toContain(
        `build/${name}`,
      );
    },
  );

  it('the microphone is granted and explained', () => {
    // Dictation lives in the renderer. Without the entitlement macOS denies the
    // device; without the usage string the app is rejected at notarization, and
    // the prompt a person sees is blank either way.
    for (const name of ['entitlements.mac.plist', 'entitlements.mac.inherit.plist']) {
      expect(read(`build/${name}`)).toContain('com.apple.security.device.audio-input');
    }
    const description = builder.mac.extendInfo.NSMicrophoneUsageDescription;
    expect(description.toLowerCase()).toContain('microphone');
    expect(description.length).toBeGreaterThan(40);
  });

  it('the loopback server is granted', () => {
    // The backend binds 127.0.0.1 and the board servers bind their own ports.
    const entitlements = read('build/entitlements.mac.plist');
    expect(entitlements).toContain('com.apple.security.network.server');
    expect(entitlements).toContain('com.apple.security.network.client');
  });

  it('the dock climb declares its apple events', () => {
    expect(builder.mac.extendInfo).toHaveProperty('NSAppleEventsUsageDescription');
  });

  it('windows signs through azure trusted signing', () => {
    expect(Object.keys(builder.win.azureSignOptions).sort()).toEqual(
      expect.arrayContaining([
        'certificateProfileName',
        'codeSigningAccountName',
        'endpoint',
        'publisherName',
      ]),
    );
  });
});

describe('updates', () => {
  it('mac ships a zip beside the dmg', () => {
    // electron-updater updates a mac app from the zip. Publishing only the dmg
    // leaves every mac install permanently on the version it was downloaded at,
    // with a working-looking updater.
    const targets = new Set(builder.mac.target.map((entry: { target: string }) => entry.target));
    expect(targets).toContain('dmg');
    expect(targets).toContain('zip');
  });

  it('the publish target is this repository', () => {
    // What electron-updater polls. Pointed anywhere else, an installed app
    // updates itself to nothing.
    expect(builder.publish.provider).toBe('github');
    expect(builder.publish.owner).toBe('yeaboi-ai');
    expect(builder.publish.repo).toBe('yeaboi-desktop');
  });
});

describe('the release workflow', () => {
  it('refuses anything that is not a final', () => {
    // An rc reaches PyPI on every version-moving push to yeaboi's main; a signed
    // installer around one would carry a notarized ticket for unreviewed code.
    expect(releaseText).toContain('^[0-9]+\\.[0-9]+\\.[0-9]+$');
  });

  it('checks pypi before three runners start', () => {
    expect(releaseText).toContain('pypi.org/pypi/yeaboi/$version/json');
  });

  it('every matrix target has a pinned python runtime', () => {
    // The staging script's TARGETS table and this matrix must cover the same
    // set — a runner with no entry fails after `npm ci`, not before.
    const script = read('scripts/fetch-python.mjs');
    const staged = new Set(
      [...script.matchAll(/'(darwin|win32|linux)-(arm64|x64)':/g)].map((m) => `${m[1]}-${m[2]}`),
    );
    expect(staged.size).toBeGreaterThan(0);
    const runners = release.jobs.build.strategy.matrix.include.map(
      (entry: { os: string; arch: string }) => {
        const platform = entry.os.includes('macos')
          ? 'darwin'
          : entry.os.includes('windows')
            ? 'win32'
            : 'linux';
        return `${platform}-${entry.arch}`;
      },
    );
    expect(runners.length).toBeGreaterThan(0);
    expect(runners.filter((target: string) => !staged.has(target))).toEqual([]);
  });

  it('asks gatekeeper what it thinks of the mac build', () => {
    expect(releaseText).toContain('spctl --assess');
  });

  it('the app carries the version of the yeaboi it bundles', () => {
    const stamp = release.jobs.build.steps.find(
      (step: { name?: string }) => step.name === 'Stamp the app version',
    );
    expect(stamp.run).toContain('npm version');
    expect(stamp.run).toContain('needs.resolve.outputs.version');
  });

  it('never rides the python release', () => {
    // Deliberately not `push: branches: [main]`. The desktop wraps a wheel that
    // already exists; nothing about merging anywhere should build one.
    const triggers = release.on;
    expect(Object.keys(triggers).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(triggers.push).toEqual({ tags: ['v*'] });
  });
});
