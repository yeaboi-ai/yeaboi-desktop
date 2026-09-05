// The embed frame's placement: over the slot on the page, nothing elsewhere.

import { describe, expect, it } from 'vitest';
import { HIDDEN_FRAME, frameStyle, sameFrame } from '../src/renderer/lib/music/embed/dock';

const slot = { left: 240.4, top: 180.6, width: 800.2, height: 352 };

describe('frameStyle', () => {
  it('lays the frame over the slot, on whole pixels', () => {
    expect(frameStyle(slot, 'slot')).toEqual({
      left: 240,
      top: 181,
      width: 800,
      height: 352,
      visible: true,
    });
  });

  it('hides the frame off-route, without a slot, or in a collapsed slot', () => {
    expect(frameStyle(slot, 'hidden')).toBe(HIDDEN_FRAME);
    expect(frameStyle(null, 'slot')).toBe(HIDDEN_FRAME);
    expect(frameStyle({ ...slot, width: 0 }, 'slot')).toBe(HIDDEN_FRAME);
    expect(frameStyle({ ...slot, height: 0.2 }, 'slot')).toBe(HIDDEN_FRAME);
  });

  it('never shows a frame with no size', () => {
    const hidden = frameStyle(null, 'hidden');
    expect(hidden.visible).toBe(false);
    expect(hidden.width).toBe(0);
    expect(hidden.height).toBe(0);
  });
});

describe('sameFrame', () => {
  it('is equal on placement alone', () => {
    const a = frameStyle(slot, 'slot');
    expect(sameFrame(a, frameStyle({ ...slot, left: 240.2 }, 'slot'))).toBe(true);
    expect(sameFrame(a, frameStyle({ ...slot, left: 241 }, 'slot'))).toBe(false);
    expect(sameFrame(a, HIDDEN_FRAME)).toBe(false);
    expect(sameFrame(HIDDEN_FRAME, frameStyle(null, 'slot'))).toBe(true);
  });
});
