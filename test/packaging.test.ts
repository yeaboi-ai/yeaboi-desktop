// How the app is packaged, signed and shipped.
//
// Everything here fails in the same expensive place otherwise: a signed,
// notarized build, forty minutes in. None of it needs electron-builder or a
// certificate to check.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

const builder = parse(read('electron-builder.yml'));
const release = read('.github/workflows/release.yml');
const pkg = JSON.parse(read('package.json'));

describe('signing', () => {
  it('the hardened runtime is on and notarized', () => {
    expect(builder.mac.hardenedRuntime).toBe(true);
    expect(builder.mac.notarize).toBe(true);
  });

  it('the bundled pythons may load the on-demand voice pack', () => {
    // The pack is pip-installed into ~/.yeaboi at runtime and loaded over
    // PYTHONPATH, so its .so files carry a different Team ID than the process.
    // Under the hardened runtime, library validation would refuse to dlopen them
    // — the install succeeds and every import from the pack fails.
    expect(read('build/entitlements.mac.inherit.plist')).toContain(
      'com.apple.security.cs.disable-library-validation',
    );
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

  it('V8 keeps its JIT under the hardened runtime', () => {
    const entitlements = read('build/entitlements.mac.plist');
    expect(entitlements).toContain('com.apple.security.cs.allow-jit');
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
  });

  it('talks out, serves its own sidecars, and hears the room', () => {
    const entitlements = read('build/entitlements.mac.plist');
    expect(entitlements).toContain('com.apple.security.network.client');
    // The app bundles its backends now: the two Python sidecars and
    // livekit-server all listen (loopback, and LAN for call participants).
    expect(entitlements).toContain('com.apple.security.network.server');
    // Dictation is back (on-device whisper) and sessions have voice/video
    // calls — the mic and camera entitlements are used, so their prompts and
    // notarization questions are earned.
    expect(entitlements).toContain('com.apple.security.device.audio-input');
    expect(entitlements).toContain('com.apple.security.device.camera');
  });

  it('the media prompts explain themselves', () => {
    expect(builder.mac.extendInfo).toHaveProperty('NSMicrophoneUsageDescription');
    expect(builder.mac.extendInfo).toHaveProperty('NSCameraUsageDescription');
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

  it('the publish target is the public releases repo', () => {
    // What electron-updater polls, written verbatim into the packaged
    // app-update.yml. This repository is private and can host nothing anybody
    // can download; pointed at it, an installed app updates itself to nothing.
    expect(builder.publish.provider).toBe('github');
    expect(builder.publish.owner).toBe('yeaboi-ai');
    expect(builder.publish.repo).toBe('yeaboi-desktop-releases');
  });

  it('the update metadata is merged across the two mac legs', () => {
    // Each leg writes a latest-mac.yml naming only its own arch and the second
    // upload replaces the first. Unmerged, an Intel install has no update
    // candidate at all and an arm64 install takes the Intel build.
    expect(release).toContain('merge-mac-update-info.mjs');
    expect(read('scripts/merge-mac-update-info.mjs')).toBeTruthy();
  });
});

describe('identity', () => {
  // Nothing else notices a half-done rename: the app menu, the bundle name and
  // the installer filenames all derive from one key, and the pieces that quote
  // it by hand are the ones that go stale.
  it('the display name is declared once, in package.json', () => {
    expect(pkg.productName).toBe('yeaboi.ai');
    expect(builder.productName).toBeUndefined();
  });

  it('the windows shortcut carries the same name', () => {
    expect(builder.nsis.shortcutName).toBe(pkg.productName);
  });

  it('the gatekeeper step finds the bundle by glob, not by name', () => {
    // `find dist -name 'yeaboi.app'` returns nothing once productName moves,
    // and `spctl` is then handed an empty path on a green run.
    const release = read('.github/workflows/release.yml');
    expect(release).toContain("-name '*.app'");
  });

  it('main dresses the app in the committed icon', () => {
    // macOS reads a packaged bundle's icon itself; the dev run has nothing but
    // this, and the About panel has nothing but this on any platform.
    const main = read('src/main/index.ts');
    expect(main).toContain('build/icon.png?asset');
    expect(main).toContain('setAboutPanelOptions');
    expect(main).toContain('dock?.setIcon');
  });

  it('settings do not move when the name does', () => {
    // app.getPath('userData') is derived from app.getName(), so an unpinned
    // path orphans an installed app's settings.json on every rename.
    expect(read('src/main/index.ts')).toContain("app.setPath('userData'");
  });
});

describe('staging', () => {
  // A missing extraResources source is a WARNING in electron-builder, not an
  // error: the installer builds, signs, notarizes, publishes — and cannot start.
  // The workflow is the only place that proves the three trees are there.
  it('the workflow calls a script that exists', () => {
    expect(release).toContain('scripts/fetch-runtimes.mjs');
    expect(release).not.toContain('fetch-python.mjs');
  });

  it('every extraResources tree is staged, and the staging is checked', () => {
    const staged = builder.extraResources.map((entry: { from: string }) => entry.from);
    expect(staged).toEqual(['resources/py', 'resources/py-planning', 'resources/livekit']);
    expect(release).toContain('--planning');
    expect(release).toContain('scripts/fetch-livekit.mjs');
    expect(release).toContain('--check');
  });

  it('the mac legs run one at a time', () => {
    // Both call getOrCreateRelease; in parallel they make two drafts.
    expect(release).toContain('max-parallel: 1');
  });

  it('the release goes somewhere the default token cannot reach', () => {
    expect(release).toContain('GH_TOKEN: ${{ secrets.RELEASES_REPO_TOKEN }}');
    expect(release).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('a stray tag cannot start a release', () => {
    // The object store this clone shares carried 141 of the Python repo's tags.
    expect(release).not.toContain("tags: ['v*']");
  });
});

describe('download links', () => {
  it('the mac artifacts are named without a version', () => {
    // yeaboi.ai links these as /releases/latest/download/<asset>, which GitHub
    // resolves only while the name is stable across releases. A ${version} here
    // 404s every download link on the site the day the next release ships, and
    // nothing on that side would notice.
    expect(builder.mac.artifactName).not.toContain('${version}');
    expect(builder.mac.artifactName).toContain('${arch}');
  });

  it('the names the website hardcodes are the names that get built', () => {
    const name = (arch: string) =>
      builder.mac.artifactName
        .replace('${productName}', pkg.productName)
        .replace('${arch}', arch)
        .replace('${ext}', 'dmg');
    expect(name('arm64')).toBe('yeaboi.ai-arm64.dmg');
    expect(name('x64')).toBe('yeaboi.ai-x64.dmg');
  });
});
