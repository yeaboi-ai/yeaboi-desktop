// Every painter, at every size and in every mode, against a recording canvas.
// vitest runs in Node, so the context is a stub that logs what was asked of it.

import { describe, expect, it } from 'vitest';
import { VIZ_STYLES } from '../src/shared/music';
import { createVizState } from '../src/renderer/lib/music/viz/frame';
import type { VizMode } from '../src/renderer/lib/music/viz/mode';
import { vizPalette } from '../src/renderer/lib/music/viz/palette';
import {
  PAINTERS,
  VIZ_STYLE_CATALOGUE,
  createPainterCache,
  painterFor,
} from '../src/renderer/lib/music/viz/styles';
import type { VizGeometry, VizSize } from '../src/renderer/lib/music/viz/styles';
import { syntheticStep } from '../src/renderer/lib/music/viz/synthetic';
import { FALLBACK_PALETTE } from '../src/renderer/lib/screensaver/palette';

interface Call {
  method: string;
  args: unknown[];
}

function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  sets: Record<string, unknown[]>;
} {
  const calls: Call[] = [];
  const sets: Record<string, unknown[]> = {};
  const gradient = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop) {
      const name = String(prop);
      if (name === 'createLinearGradient') return () => gradient;
      if (name in target) return target[name];
      return (...args: unknown[]) => {
        calls.push({ method: name, args });
      };
    },
    set(_t, prop, value) {
      const name = String(prop);
      target[name] = value;
      (sets[name] ??= []).push(value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, sets };
}

const SIZES: Record<VizSize, [number, number]> = {
  pocket: [48, 48],
  popover: [264, 44],
  page: [816, 120],
};
const MODES: VizMode[] = ['live', 'connecting', 'paused', 'off', 'failed'];

function liveFrame() {
  const state = createVizState(48_000, 2048);
  for (let i = 0; i < 40; i += 1)
    syntheticStep(state, 1 / 60, { gain: 1, smoothing: 0.5, peaks: true });
  return state;
}

describe('the catalogue', () => {
  it('has a painter, a name and a blurb for every style, and nothing else', () => {
    expect(Object.keys(PAINTERS).sort()).toEqual([...VIZ_STYLES].sort());
    expect(VIZ_STYLE_CATALOGUE.map((s) => s.id)).toEqual([...VIZ_STYLES]);
    for (const entry of VIZ_STYLE_CATALOGUE) {
      expect(entry.name).toBeTruthy();
      expect(entry.blurb.length).toBeGreaterThan(10);
      expect(entry.blurb).not.toMatch(/\b[A-Z]{2,}\b/);
    }
    expect(painterFor('blocks').id).toBe('blocks');
  });

  it('never asks the page for more columns than the preference', () => {
    for (const painter of Object.values(PAINTERS)) {
      for (const preferred of [16, 32, 64] as const) {
        expect(painter.bandsFor('page', preferred)).toBeLessThanOrEqual(64);
        expect(painter.bandsFor('pocket', preferred)).toBeLessThanOrEqual(16);
      }
    }
    expect(PAINTERS.blocks.bandsFor('pocket', 64)).toBe(4);
    expect(PAINTERS.blocks.bandsFor('page', 32)).toBe(32);
  });
});

describe('painting', () => {
  const frame = liveFrame();
  const palette = vizPalette(FALLBACK_PALETTE, { colour: 'amber', customHex: '#000000' }, false);
  const ramp = vizPalette(FALLBACK_PALETTE, { colour: 'spectrum', customHex: '#000000' }, false);

  for (const painter of Object.values(PAINTERS)) {
    for (const size of Object.keys(SIZES) as VizSize[]) {
      for (const mode of MODES) {
        it(`${painter.id} paints ${size} while ${mode} inside the box with finite numbers`, () => {
          const [width, height] = SIZES[size];
          const geo: VizGeometry = { width, height, size, bands: painter.bandsFor(size, 64) };
          const { ctx, calls, sets } = recordingContext();
          const opts = { peaks: true, mirror: size === 'page', glow: true };
          painter.paint(
            ctx,
            frame,
            geo,
            mode === 'live' ? ramp : palette,
            opts,
            mode,
            createPainterCache(),
          );
          expect(calls.length).toBeGreaterThan(0);
          for (const call of calls) {
            for (const arg of call.args) {
              if (typeof arg === 'number')
                expect(Number.isFinite(arg), `${call.method} got ${arg}`).toBe(true);
            }
            if (call.method === 'fillRect') {
              const [x, y, w, h] = call.args as number[];
              expect(x!).toBeGreaterThanOrEqual(-0.01);
              expect(y!).toBeGreaterThanOrEqual(-0.01);
              expect(x! + w!).toBeLessThanOrEqual(width + 0.01);
              expect(y! + h!).toBeLessThanOrEqual(height + 0.01);
            }
          }
          const blurs = (sets['shadowBlur'] ?? []) as number[];
          if (mode === 'off' || mode === 'paused' || mode === 'failed' || size === 'pocket') {
            expect(Math.max(0, ...blurs)).toBe(0);
          }
        });
      }
    }
  }

  it('blocks lights exactly columns × rows cells on the page', () => {
    const geo: VizGeometry = { width: 816, height: 120, size: 'page', bands: 64 };
    const { ctx, calls } = recordingContext();
    PAINTERS.blocks.paint(
      ctx,
      frame,
      geo,
      palette,
      { peaks: false, mirror: false, glow: false },
      'live',
      createPainterCache(),
    );
    expect(calls.filter((c) => c.method === 'fillRect')).toHaveLength(64 * 8);
  });

  it('draws the floor, not the frame, when off', () => {
    const geo: VizGeometry = { width: 816, height: 120, size: 'page', bands: 64 };
    const { ctx, sets } = recordingContext();
    PAINTERS.bars.paint(
      ctx,
      frame,
      geo,
      palette,
      { peaks: true, mirror: false, glow: true },
      'off',
      createPainterCache(),
    );
    expect(sets['fillStyle']).toContain(palette.floor);
    expect(sets['fillStyle']).not.toContain(palette.main);
  });
});
