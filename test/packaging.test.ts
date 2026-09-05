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

  it('the mac targets pin no arch, so the workflow decides one per leg', () => {
    // An arch list here overrides the CLI's --arm64/--x64 and every leg packages
    // both. A leg stages runtimes for its own arch only, so the other arch's dmg
    // ships the wrong interpreter — it packages, signs and notarizes clean and
    // then fails on first launch.
    for (const target of builder.mac.target) {
      expect(typeof target).toBe('string');
    }
    expect(builder.mac.target).toContain('dmg');
    expect(builder.mac.target).toContain('zip');
  });

  it('every bundled runtime is checked against the arch being built', () => {
    const step = release.slice(release.indexOf('The bundled runtimes match the architecture'));
    // all three, because each is staged by a different script
    for (const tree of ['py', 'py-planning', 'livekit-server']) {
      expect(step.slice(0, step.indexOf('Assess the signed app'))).toContain(tree);
    }
    expect(step).toContain('lipo -archs');
    expect(step).toMatch(/x64\).*x86_64/s);
  });

  it("a retry clears this leg's assets first, so shas cannot drift from files", () => {
    // electron-publish skips an upload whose name already exists with only a
    // warning. Retrying without clearing puts the rebuilt zip's sha512 into
    // latest-mac.yml while the failed attempt's file stays served — every update
    // for that arch then fails its integrity check, and nothing goes red.
    const step = release.slice(
      release.indexOf('Build, sign and publish'),
      release.indexOf('The bundled runtimes match'),
    );
    expect(step).toContain('clear_leg_assets()');
    // once before the first attempt, once before the retry
    expect(step.match(/^\s*clear_leg_assets$/gm)?.length).toBe(2);
    // scoped to this arch: the other leg may have finished already
    expect(step).toContain('--arg a "-$ARCH."');
  });

  it('spotlight is stopped before the dmg is detached', () => {
    // dmgbuild detaches the image it just wrote and Spotlight indexing the new
    // volume still holds it: "hdiutil: couldn't eject disk2 - Resource busy".
    expect(release).toContain('mdutil -a -i off');
    expect(release.indexOf('mdutil')).toBeLessThan(release.indexOf('Build, sign and publish'));
  });

  it('one draft is created up front, so racing publishers cannot make two', () => {
    // PublishManager.getOrCreatePublisher is async and does check-then-set across
    // an await, so concurrent uploads each build a publisher with its own Lazy and
    // each calls getOrCreateRelease. A draft has no tag to collide on, so GitHub
    // accepts both and the assets split across two drafts. max-parallel does not
    // help — the race is inside a single leg.
    const resolve = release.slice(release.indexOf('resolve:'), release.indexOf('  build:'));
    expect(resolve).toContain('gh release create "v$VERSION"');
    expect(resolve).toContain('--draft');
    // and it must refuse to rewrite something the website already links to
    expect(resolve).toContain('is already published');
    // the assertion job must not trust a tag lookup that duplicates make ambiguous
    expect(release).toMatch(/releases tagged v\$VERSION, expected 1/);
  });

  it('gatekeeper is still asserted whenever a certificate exists', () => {
    // The step degrades to a warning without CSC_LINK so the credential-free
    // rehearsal can reach the jobs downstream of it. That escape hatch must stay
    // tied to the secret — dropping spctl entirely would make every signed
    // release green on an app macOS refuses to open.
    const step = release.slice(release.indexOf('Assess the signed app'));
    expect(step).toContain("SIGNED: ${{ secrets.CSC_LINK != '' }}");
    expect(step).toMatch(/if \[ "\$SIGNED" != "true" \]/);
    expect(step).toContain('spctl --assess --type execute');
    expect(step).toContain('codesign --verify --deep --strict');
  });

  it('an unset signing secret reaches electron-builder unset, not empty', () => {
    // GitHub expands an absent secret to "" and still exports the key.
    // electron-builder's getCscLink prefers "" over unset ("allow to specify as
    // empty string"), then resolves the cert against the project dir and dies with
    // "<projectDir> not a file" — so every credential-free build fails at publish.
    const step = release.slice(release.indexOf('Build, sign and publish'));
    expect(step).toMatch(/for v in CSC_LINK[\s\S]*?\|\| unset "\$v"/);
    for (const v of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_TEAM_ID']) {
      expect(step.slice(0, step.indexOf('npx electron-builder'))).toContain(v);
    }
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
    // A target is a bare string once no arch is pinned; tolerate either form.
    const targets = new Set(
      builder.mac.target.map((entry: string | { target: string }) =>
        typeof entry === 'string' ? entry : entry.target,
      ),
    );
    expect(targets).toContain('dmg');
    expect(targets).toContain('zip');
  });

  it('the publish target is the public releases repo', () => {
    // What electron-updater polls, written verbatim into the packaged
    // app-update.yml. Every installed app already points here; moving the
    // releases would strand each one's updater.
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

  it('nothing downloads uninvited, and a quit finishes a pending install', () => {
    const updater = read('src/main/updater.ts');
    expect(updater).toContain('autoDownload = false');
    expect(updater).toContain('autoInstallOnAppQuit = true');
  });

  it('main checks for updates on its own schedule', () => {
    // The check is automatic; the download is not. Deleting the scheduler would
    // silently return the app to update-only-if-someone-opens-the-tray.
    const main = read('src/main/index.ts');
    expect(main).toContain('shouldAutoCheck');
    expect(main).toContain('UPDATE_CHECK_DELAY_MS');
    expect(main).toContain('UPDATE_CHECK_INTERVAL_MS');
  });

  it('the update policy lives in the shared module, not re-forked per process', () => {
    expect(read('src/main/updater.ts')).toContain("from '../shared/update'");
    expect(read('src/main/tray.ts')).toContain("from '../shared/update'");
    expect(read('src/renderer/lib/yeaboi/api.ts')).toContain("from '@shared/update'");
  });
});

describe('the release runs itself', () => {
  // The desktop ships like the TUI: auto-version.yml moves the version on the
  // PR, and the merge to main is what builds and publishes. Everything here is
  // what keeps that from shipping the wrong thing, or nothing, quietly.
  const resolve = release.slice(release.indexOf('resolve:'), release.indexOf('  build:'));

  it('starts on a push to main, and can still be dispatched', () => {
    const on = parse(release).on;
    expect(on.push.branches).toEqual(['main']);
    expect(on.workflow_dispatch.inputs.yeaboi_version.required).toBe(false);
  });

  it('bundles the newest final wheel on PyPI unless one is named', () => {
    expect(resolve).toContain('pypi.org/pypi/yeaboi/json');
    expect(resolve).toContain('.yanked == false');
    expect(resolve).toContain('sort -V | tail -1');
  });

  it('is a no-op on a push whose version is already out, and refuses by hand', () => {
    // A docs-only merge must stay green; a human re-dispatching a shipped
    // version must hear about it.
    const check = resolve.slice(resolve.indexOf('is already published'));
    expect(resolve).toMatch(/if \[ "\$EVENT" = "push" \][\s\S]*should_release=false[\s\S]*exit 0/);
    expect(check).toContain('::error::');
    expect(resolve).toContain('should_release=true');
  });

  it('tests the tree that ships, before any leg is paid for', () => {
    expect(resolve).toMatch(/npm ci\n\s+npm test/);
    expect(resolve.indexOf('npm test')).toBeLessThan(resolve.indexOf('Create the one draft'));
  });

  it('skips the build and the merge when there is nothing to release', () => {
    for (const jobName of ['  build:', '  update-metadata:']) {
      const start = release.indexOf(jobName);
      const jobText = release.slice(start, release.indexOf('\n    steps:', start));
      expect(jobText).toContain("if: needs.resolve.outputs.should_release == 'true'");
    }
    // the matrix must exist even on the skip path: an empty include vector is
    // an evaluation error on a job that is only about to be skipped
    const legs = parse(release).jobs.resolve.steps.find((s: { id?: string }) => s.id === 'legs');
    expect(legs.if).toBeUndefined();
  });

  it('publishes last, and only a build Gatekeeper was asked about', () => {
    const publish = release.slice(release.indexOf('Publish the release'));
    expect(release.indexOf('--draft=false')).toBeGreaterThan(
      release.indexOf('releases tagged v$VERSION, expected 1'),
    );
    expect(publish).toContain("SIGNED: ${{ secrets.CSC_LINK != '' }}");
    expect(publish).toMatch(
      /if \[ "\$SIGNED" != "true" \][\s\S]*exit 0[\s\S]*gh release edit "v\$VERSION"[\s\S]*--draft=false --latest/,
    );
  });
});

describe('versioning', () => {
  // The app's version is its own line, independent of the bundled wheel. The
  // updater compares it, so a release that regressed below the last published
  // one (3.32.0, the final shared-version release) would strand every install.
  it('package.json carries a real version above the shared-version era', () => {
    const [major] = pkg.version.split('.').map(Number);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(major).toBeGreaterThanOrEqual(4);
  });

  it('the workflow reads the version from the tree, never stamps one', () => {
    expect(release).not.toContain('npm version');
    expect(release).toContain('jq -r .version package.json');
  });

  it('a release refuses to ship without its notes', () => {
    expect(release).toContain(
      "jq -r '.entries[0].version' src/renderer/lib/yeaboi/shell-changelog.json",
    );
    expect(release).toContain('every release ships its notes');
  });

  it('the release notes come from the shell ledger', () => {
    expect(release).toContain('scripts/release-notes.mjs');
    expect(release).toContain('--notes-file');
    expect(release).not.toContain('--notes "yeaboi.ai');
  });

  it('the bundled runtimes are fetched at the wheel version, not the app version', () => {
    const staging = release.slice(
      release.indexOf('Stage the bundled runtimes'),
      release.indexOf('Install livekit-server'),
    );
    expect(staging).toContain('fetch-runtimes.mjs --version "${{ needs.resolve.outputs.wheel }}"');
    expect(staging).not.toContain('needs.resolve.outputs.version');
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
    const main = read('src/main/index.ts');
    expect(main).toMatch(/app\.setPath\(\s*'userData',/);
    expect(main).toContain("app.isPackaged ? 'yeaboi' : 'yeaboi-desktop'");
  });

  it('a recording can point the profile somewhere else', () => {
    // macOS resolves userData from the password database, so neither
    // --user-data-dir nor $HOME moves it. Without this env var `make demo`
    // films the profile of whoever ran it, putting their name and email in a
    // public README GIF.
    const main = read('src/main/index.ts');
    expect(main).toContain('YEABOI_DESKTOP_PROFILE');
    // It has to be part of the pinning call above: that call is unconditional,
    // so an override set before it is simply replaced.
    expect(main).toMatch(/setPath\(\s*'userData',\s*profileOverride \|\|/);
  });
});

describe('the dock tile', () => {
  // An app that macOS treats as an accessory has no Dock tile, no menu bar and
  // can never become the active app. It is a runtime policy, so neither the
  // icon nor the bundle proves anything about it.
  it('main claims the regular activation policy on macOS', () => {
    const main = read('src/main/index.ts');
    const ready = main.slice(main.indexOf('app.whenReady()'));
    expect(ready).toContain("app.setActivationPolicy('regular')");
    expect(ready).toContain("process.platform === 'darwin'");
  });

  it('the bundle states it is not a UIElement', () => {
    expect(builder.mac.extendInfo.LSUIElement).toBe(false);
  });

  it('the pet keeps its fullscreen visibility without transforming the app', () => {
    // setVisibleOnAllWorkspaces(…, { visibleOnFullScreen: true }) transforms the
    // process to UIElementApplication unless told not to, which cost the whole
    // app its Dock tile and its menu bar for as long as the duck was on.
    const pet = read('src/main/pet.ts');
    const call = pet.slice(pet.indexOf('setVisibleOnAllWorkspaces'));
    expect(call).toContain('skipTransformProcessType: true');
  });

  it('the window is named after the app, not the vendored backend', () => {
    // Electron takes the window title from the page, so index.html's <title> is
    // only the start of it: the brand provider rewrites document.title on every
    // render and is what the title bar ends up showing.
    const brand = read('src/renderer/components/providers/brand-provider.tsx');
    expect(brand).not.toContain('Planning Platform');
    expect(brand).toContain("DEFAULT_APP_NAME = 'yeaboi.ai'");
    expect(read('src/renderer/index.html')).toContain('<title>yeaboi.ai</title>');
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

  it('the legs are free to run concurrently, because nothing is shared', () => {
    // Serialising them cost a whole extra leg of signing and notarization. It is
    // only safe to drop while all three of these hold, so they are asserted here
    // rather than left to a comment: one draft made up front, per-leg metadata
    // merged from the artifacts, and asset clearing scoped to a leg's own arch.
    // the key, not the word — the comment in resolve still explains the history
    expect(release).not.toMatch(/^\s*max-parallel:/m);
    expect(release).toContain('gh release create "v$VERSION"');
    expect(release).toContain('merge-mac-update-info.mjs');
    expect(release).toContain('--arg a "-$ARCH."');
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
