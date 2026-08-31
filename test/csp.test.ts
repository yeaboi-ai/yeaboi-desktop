/**
 * The renderer CSP is generated, and these are the two bugs that made it so.
 *
 * index.html carried the wide policy on a `<meta name="viewport">` tag, which
 * does nothing, and the tag that WAS live named only :8000 — blocking both the
 * :8001..:8010 the planning sidecar has always probed and the ws://…:7880
 * LiveKit has always used.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIVEKIT_PORT, planningPortRange, rendererCsp } from '../src/shared/csp';

const INDEX = join(import.meta.dirname, '..', 'src', 'renderer', 'index.html');

describe('planningPortRange', () => {
  // Cleared BEFORE each case as well as after: once a worktree has a block,
  // `make test` exports these, and the default case would read that block
  // rather than the default it is asserting.
  const clear = () => {
    delete process.env['YEABOI_PLANNING_PORT'];
    delete process.env['YEABOI_PLANNING_PORT_COUNT'];
  };
  beforeEach(clear);
  afterEach(clear);

  it('is the historical 8000..8010 with no worktree block', () => {
    expect(planningPortRange()).toEqual([
      8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010,
    ]);
  });

  it('follows the worktree block when there is one', () => {
    process.env['YEABOI_PLANNING_PORT'] = '20165';
    process.env['YEABOI_PLANNING_PORT_COUNT'] = '5';
    expect(planningPortRange()).toEqual([20165, 20166, 20167, 20168, 20169]);
  });

  it('falls back rather than yielding NaN ports on a bad value', () => {
    process.env['YEABOI_PLANNING_PORT'] = 'not-a-port';
    expect(planningPortRange()[0]).toBe(8000);
  });
});

describe('rendererCsp', () => {
  it('permits every port the sidecar may actually take', () => {
    const ports = [20165, 20166, 20167];
    const csp = rendererCsp({ planningPorts: ports });
    for (const port of ports) {
      expect(csp).toContain(`http://127.0.0.1:${port}`);
      expect(csp).toContain(`ws://127.0.0.1:${port}`);
    }
  });

  it('permits LiveKit signalling, which the old policy silently blocked', () => {
    const csp = rendererCsp({ planningPorts: [8000] });
    expect(csp).toContain(`ws://127.0.0.1:${LIVEKIT_PORT}`);
    expect(csp).toContain(`wss://localhost:${LIVEKIT_PORT}`);
  });

  it('keeps the restrictive directives it always had', () => {
    const csp = rendererCsp({ planningPorts: [8000] });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

describe('index.html', () => {
  it('carries no hand-written CSP for the generated one to be intersected with', () => {
    // Two meta CSPs are intersected, so a leftover tag silently narrows the
    // generated policy back down.
    expect(readFileSync(INDEX, 'utf8')).not.toContain('default-src');
  });

  it('still declares a real viewport', () => {
    expect(readFileSync(INDEX, 'utf8')).toContain(
      '<meta name="viewport" content="width=device-width',
    );
  });
});
