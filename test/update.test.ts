// The shared update policy: where a build can update, what the tray says, when
// the automatic check runs, and when the passive chrome shows.

import { describe, expect, it } from 'vitest';
import {
  UPDATE_CHECK_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
  shouldAutoCheck,
  updateIndicatorVisible,
  updateLabel,
  updateSupport,
  type UpdateState,
} from '../src/shared/update';

describe('updateSupport', () => {
  it('a dev run cannot update itself', () => {
    expect(updateSupport(false, 'darwin', undefined)).toContain('dev server');
  });

  it('a linux package install belongs to the package manager', () => {
    expect(updateSupport(true, 'linux', undefined)).toContain('package manager');
  });

  it('an AppImage, a mac and a windows install can all update', () => {
    expect(updateSupport(true, 'linux', '/opt/yeaboi.AppImage')).toBeNull();
    expect(updateSupport(true, 'darwin', undefined)).toBeNull();
    expect(updateSupport(true, 'win32', undefined)).toBeNull();
  });
});

describe('updateLabel', () => {
  it.each<[UpdateState, string]>([
    [{ kind: 'idle' }, 'Check for updates…'],
    [{ kind: 'checking' }, 'Checking for updates…'],
    [{ kind: 'available', version: '4.1.0' }, 'Download yeaboi.ai 4.1.0'],
    [{ kind: 'downloading', version: '4.1.0', percent: 41 }, 'Downloading 4.1.0 — 41%'],
    [{ kind: 'ready', version: '4.1.0' }, 'Restart to update to 4.1.0'],
    [{ kind: 'error', message: 'offline' }, 'Check for updates… (last check failed)'],
    [{ kind: 'unsupported', reason: 'dev' }, 'Updates are managed outside the app'],
  ])('%o → %s', (state, label) => {
    expect(updateLabel(state, 'yeaboi.ai')).toBe(label);
  });
});

describe('shouldAutoCheck', () => {
  it.each<[UpdateState['kind'], boolean]>([
    ['idle', true],
    ['available', true], // a newer release supersedes an unclicked older one
    ['error', true], // an offline launch retries on the next tick
    ['checking', false],
    ['downloading', false],
    ['ready', false],
    ['unsupported', false],
  ])('%s → %s', (kind, expected) => {
    expect(shouldAutoCheck(kind)).toBe(expected);
  });
});

describe('updateIndicatorVisible', () => {
  it('an available update shows until its version is dismissed', () => {
    const state: UpdateState = { kind: 'available', version: '4.1.0' };
    expect(updateIndicatorVisible(state, null)).toBe(true);
    expect(updateIndicatorVisible(state, '4.0.5')).toBe(true);
    expect(updateIndicatorVisible(state, '4.1.0')).toBe(false);
  });

  it('a download in flight and a pending restart always show', () => {
    expect(
      updateIndicatorVisible({ kind: 'downloading', version: '4.1.0', percent: 3 }, '4.1.0'),
    ).toBe(true);
    expect(updateIndicatorVisible({ kind: 'ready', version: '4.1.0' }, '4.1.0')).toBe(true);
  });

  it('background states produce no chrome', () => {
    expect(updateIndicatorVisible({ kind: 'idle' }, null)).toBe(false);
    expect(updateIndicatorVisible({ kind: 'checking' }, null)).toBe(false);
    expect(updateIndicatorVisible({ kind: 'error', message: 'offline' }, null)).toBe(false);
    expect(updateIndicatorVisible({ kind: 'unsupported', reason: 'dev' }, null)).toBe(false);
  });
});

describe('the schedule', () => {
  it('is a launch delay and a long interval, not a debug value', () => {
    expect(UPDATE_CHECK_DELAY_MS).toBeGreaterThanOrEqual(5_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
