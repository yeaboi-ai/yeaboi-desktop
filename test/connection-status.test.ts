// What a connection's chip says.
//
// The bug this replaces: "connected" was `some secret is set`, so a dummy
// ElevenLabs key read as connected. Presence and health are two facts and the
// table below keeps them apart — including for a sidecar that sends no health
// at all, where the honest answer is "not tested", never "connected".

import { describe, expect, it } from 'vitest';
import { resolveStatus, statusFor } from '../src/renderer/lib/yeaboi/connection-status';
import { terseAge } from '../src/renderer/lib/relative-time';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const NOW = new Date('2026-09-09T12:00:00Z');

describe('resolveStatus', () => {
  it('a credential nobody has saved is not connected', () => {
    const chip = resolveStatus({ configured: false }, NOW);
    expect(chip.state).toBe('unset');
    expect(chip.label).toBe('not connected');
  });

  it('a saved key nothing has probed is saved, not connected', () => {
    const chip = resolveStatus({ configured: true }, NOW);
    expect(chip.state).toBe('untested');
    expect(chip.label).toBe('key saved · not tested');
    expect(chip.tone).toBe('muted');
    expect(chip.label).not.toContain('connected');
  });

  it('an older sidecar that sends no status reads the same way', () => {
    // The regression guard: absent health must never be optimism.
    expect(resolveStatus({ configured: true, status: undefined }, NOW).state).toBe('untested');
  });

  it('an explicit untested outcome reads the same way', () => {
    const status = { outcome: 'untested' as const, message: '', checked_at: '' };
    expect(resolveStatus({ configured: true, status }, NOW).state).toBe('untested');
  });

  it('a verified key says so, and says when', () => {
    const status = {
      outcome: 'ok' as const,
      message: 'ElevenLabs verified — creator tier',
      checked_at: '2026-09-09T11:58:00Z',
    };
    const chip = resolveStatus({ configured: true, status }, NOW);
    expect(chip.state).toBe('ok');
    expect(chip.label).toBe('connected · verified 2m ago');
    expect(chip.tone).toBe('success');
  });

  it('a verified key with no timestamp still reads connected', () => {
    const status = { outcome: 'ok' as const, message: 'verified', checked_at: '' };
    expect(resolveStatus({ configured: true, status }, NOW).label).toBe('connected');
  });

  it('a refused key says why', () => {
    const status = {
      outcome: 'failed' as const,
      message: 'Invalid Tavus API key',
      checked_at: '2026-09-09T11:00:00Z',
    };
    const chip = resolveStatus({ configured: true, status }, NOW);
    expect(chip.state).toBe('failed');
    expect(chip.label).toBe('Invalid Tavus API key');
    expect(chip.tone).toBe('destructive');
  });

  it('a refused key with no reason still says it failed', () => {
    const status = { outcome: 'failed' as const, message: '   ', checked_at: '' };
    expect(resolveStatus({ configured: true, status }, NOW).label).toBe('invalid key');
  });
});

describe('a connection with no probe', () => {
  it('is worded as presence, since nothing can ever test it', () => {
    // Slack and Azure DevOps: "not tested" about a thing nothing tests reads
    // as a fault. The chip component narrows the copy; the table still says
    // untested, which is what the wire means.
    const chip = read(
      'src',
      'renderer',
      'components',
      'settings',
      'primitives',
      'connection-status-chip.tsx',
    );
    expect(chip).toContain('probeable');
    expect(chip).toContain("label: 'key saved'");
  });
});

describe('statusFor', () => {
  it('is undefined when the snapshot carries no connections block', () => {
    expect(statusFor(undefined, 'github')).toBeUndefined();
  });

  it('picks the row out by kind', () => {
    const rows = { github: { outcome: 'ok' as const, message: '', checked_at: '' } };
    expect(statusFor(rows, 'github')?.outcome).toBe('ok');
    expect(statusFor(rows, 'notion')).toBeUndefined();
  });
});

describe('terseAge', () => {
  it('is short enough to sit inside a chip', () => {
    expect(terseAge('2026-09-09T11:59:30Z', NOW)).toBe('just now');
    expect(terseAge('2026-09-09T11:45:00Z', NOW)).toBe('15m ago');
    expect(terseAge('2026-09-09T09:00:00Z', NOW)).toBe('3h ago');
    expect(terseAge('2026-09-08T09:00:00Z', NOW)).toBe('yesterday');
    expect(terseAge('2026-09-06T09:00:00Z', NOW)).toBe('3d ago');
    expect(terseAge('2026-08-20T09:00:00Z', NOW)).toBe('20 Aug');
  });

  it('an absent or unreadable stamp is nothing at all', () => {
    expect(terseAge('', NOW)).toBe('');
    expect(terseAge('not-a-date', NOW)).toBe('');
  });
});
