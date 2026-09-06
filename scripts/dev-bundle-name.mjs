// Name and dress the Electron a dev run lives inside.
//
// `npm run dev` executes node_modules' stock Electron.app, and macOS takes the
// Dock label and the menu-bar title from *that* bundle's Info.plist —
// `app.setName()` cannot reach either. So the bundle is stamped with the
// product name and the committed .icns before the dev server starts.
//
// The bundle is gitignored, re-downloaded by `npm install`, and absent wherever
// ELECTRON_SKIP_BINARY_DOWNLOAD is set (CI, provision.sh) — every failure here
// is a warning, never a broken `npm run dev`.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = resolve(ROOT, 'node_modules/electron/dist/Electron.app');
const PLIST = resolve(APP, 'Contents/Info.plist');
// Electron's own icon filename: keeping it means CFBundleIconFile still points
// at the file we replaced.
const ICON = resolve(APP, 'Contents/Resources/electron.icns');
const SOURCE_ICON = resolve(ROOT, 'build/icon.icns');
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const name = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).productName;

function plist(...args) {
  return execFileSync('/usr/libexec/PlistBuddy', [...args, PLIST], { encoding: 'utf8' }).trim();
}

/** Set a key that may or may not already exist. */
function setKey(key, value) {
  try {
    plist('-c', `Set :${key} ${value}`);
  } catch {
    plist('-c', `Add :${key} string ${value}`);
  }
}

if (process.platform !== 'darwin') process.exit(0);
if (!existsSync(PLIST)) {
  console.log('[dev-bundle-name] no local Electron.app — skipping');
  process.exit(0);
}
if (!existsSync(SOURCE_ICON)) {
  console.warn('[dev-bundle-name] build/icon.icns is missing — run: make icons');
  process.exit(0);
}

/** Does the bundle satisfy codesign right now? */
function verifies() {
  try {
    execFileSync('codesign', ['--verify', APP], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let current = '';
try {
  current = plist('-c', 'Print :CFBundleName');
} catch {
  /* an Electron without the key is still worth stamping */
}
/** The bundle's icon is the committed one, byte for byte. */
const dressed = () => {
  try {
    return readFileSync(ICON).equals(readFileSync(SOURCE_ICON));
  } catch {
    return false;
  }
};

// Re-registering is what the Dock reads: it caches the bundle's identity, and
// a stamped plist with a stale record still comes up as "Electron".
function reregister() {
  if (existsSync(LSREGISTER)) execFileSync(LSREGISTER, ['-f', APP], { stdio: 'ignore' });
}

if (current === name && dressed()) {
  reregister();
  process.exit(0);
}

// The download is linker-signed ad-hoc: only the Mach-O is covered, the
// Info.plist is not bound and the resources are not sealed — so as it ships it
// does not satisfy `codesign --verify` as a bundle either. Whether it did
// before the edit is the only thing that makes verifying afterwards meaningful.
const wasSigned = verifies();

const plistBackup = `${PLIST}.orig`;
const iconBackup = `${ICON}.orig`;
if (!existsSync(plistBackup)) copyFileSync(PLIST, plistBackup);
if (!existsSync(iconBackup)) copyFileSync(ICON, iconBackup);

try {
  setKey('CFBundleName', name);
  setKey('CFBundleDisplayName', name);
  copyFileSync(SOURCE_ICON, ICON);

  if (wasSigned && !verifies()) {
    execFileSync('codesign', ['--force', '--sign', '-', APP], { stdio: 'ignore' });
    if (!verifies()) throw new Error('re-signing did not restore the signature');
  }

  reregister();
  console.log(`[dev-bundle-name] the dev Electron is "${name}" with the duck`);
} catch (error) {
  copyFileSync(plistBackup, PLIST);
  copyFileSync(iconBackup, ICON);
  console.warn(`[dev-bundle-name] left the stock Electron alone: ${error.message}`);
}
