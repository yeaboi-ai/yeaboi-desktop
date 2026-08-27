// How the app is packaged, signed and shipped.
//
// Everything here fails in the same expensive place otherwise: a three-OS
// signed build, twenty minutes in. None of it needs electron-builder or a
// certificate to check. (The old python-bundle invariants left with the
// sidecar — the app is a pure client of the planning backend now.)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

const builder = parse(read('electron-builder.yml'));

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

  it('V8 keeps its JIT under the hardened runtime', () => {
    const entitlements = read('build/entitlements.mac.plist');
    expect(entitlements).toContain('com.apple.security.cs.allow-jit');
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
  });

  it('talks to the backend but serves nothing', () => {
    const entitlements = read('build/entitlements.mac.plist');
    expect(entitlements).toContain('com.apple.security.network.client');
    expect(entitlements).not.toContain('com.apple.security.network.server');
    // No dictation any more — a mic entitlement we do not use is a prompt
    // (and a notarization question) we do not want.
    expect(entitlements).not.toContain('com.apple.security.device.audio-input');
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
