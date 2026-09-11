// The room around the chat: a drawer pushes the transcript aside while the
// column keeps its reading width, and overlays it when it would not.

import { describe, expect, it } from 'vitest';
import {
  ROOM_GEOMETRY,
  clampDrawerWidth,
  roomLayout,
} from '../src/renderer/lib/planning/room-layout';

describe('roomLayout', () => {
  const needed = ROOM_GEOMETRY.roomWidth + 2 * ROOM_GEOMETRY.gutter + ROOM_GEOMETRY.stripWidth;

  it('pushes when the column still fits beside the drawer', () => {
    expect(roomLayout(needed + 480, 480)).toEqual({
      mode: 'push',
      column: needed + 480 - 44 - 480,
    });
  });

  it('overlays when the drawer would squeeze the column', () => {
    const layout = roomLayout(needed + 200, 480);
    expect(layout.mode).toBe('overlay');
    expect(layout.column).toBe(needed + 200 - ROOM_GEOMETRY.stripWidth);
  });

  it('is a push with no drawer open, whatever the window', () => {
    expect(roomLayout(960, 0).mode).toBe('push');
    expect(roomLayout(300, 0).column).toBe(300 - ROOM_GEOMETRY.stripWidth);
  });

  it('never reports a negative column', () => {
    expect(roomLayout(10, 0).column).toBe(0);
  });
});

describe('clampDrawerWidth', () => {
  it('keeps a stored width between the minimum and half the window', () => {
    expect(clampDrawerWidth(200, 1600)).toBe(360);
    expect(clampDrawerWidth(1000, 1600)).toBe(800);
    expect(clampDrawerWidth(500.4, 1600)).toBe(500);
  });

  it('never goes under the minimum on a narrow window', () => {
    expect(clampDrawerWidth(700, 600)).toBe(360);
  });
});
