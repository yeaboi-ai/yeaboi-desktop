// Where the shell looks for a backend. The three arms are pure; spawning one is
// not, and is not what breaks. Arm 3 changed when the Python moved into its own
// repo — there is no working tree above this one to reach for any more, and the
// failure mode of getting it wrong is a dev build that starts, waits twenty
// seconds for a handshake, and reports the backend as down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = { app: { isPackaged: false } };
vi.mock('electron', () => electron);
const { resolveCommand } = await import('../src/main/sidecar');

const ORIGINAL = { ...process.env };

beforeEach(() => {
  electron.app.isPackaged = false;
  delete process.env['YEABOI_DESKTOP_PYTHON'];
  delete process.env['YEABOI_REPO'];
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('resolveCommand', () => {
  it('takes an explicit interpreter first, packaged or not', () => {
    process.env['YEABOI_DESKTOP_PYTHON'] = '/somewhere/python3';
    electron.app.isPackaged = true;
    expect(resolveCommand()).toEqual({
      command: '/somewhere/python3',
      args: ['-m', 'yeaboi', 'app'],
    });
  });

  it('packaged, spawns the interpreter staged beside the app', () => {
    // Must agree with electron-builder.yml's extraResources and with
    // scripts/fetch-python.mjs — asserted together in packaging.test.ts.
    electron.app.isPackaged = true;
    // `resourcesPath` is Electron's own read-only addition to `process`.
    Object.defineProperty(process, 'resourcesPath', {
      value: '/Applications/yeaboi.app/Contents/Resources',
      configurable: true,
    });
    const { command, args } = resolveCommand();
    expect(command).toBe('/Applications/yeaboi.app/Contents/Resources/py/bin/python3');
    expect(args).toEqual(['-m', 'yeaboi', 'app']);
  });

  it('unpackaged, drives a sibling yeaboi checkout through uv', () => {
    process.env['YEABOI_REPO'] = '/checkouts/yeaboi.ai';
    expect(resolveCommand()).toEqual({
      command: 'uv',
      args: ['run', 'yeaboi', 'app'],
      cwd: '/checkouts/yeaboi.ai',
    });
  });

  it('unpackaged with no override, looks beside this repo and never inside it', () => {
    const { cwd } = resolveCommand();
    expect(cwd).toBeTruthy();
    // The Python is a sibling now. A path under this repo would be the old
    // monorepo layout, and `uv run` there finds no project at all.
    expect(cwd!.endsWith('/yeaboi.ai')).toBe(true);
    expect(cwd!.startsWith(process.cwd() + '/')).toBe(false);
  });
});
