// Links a frame opens: a music link comes back to the player, the rest leave.

import { describe, expect, it } from 'vitest';
import { routeWindowOpen } from '../src/shared/window-open';

describe('routeWindowOpen', () => {
  it("plays YouTube's tray and end-screen links in the window", () => {
    const url = 'https://www.youtube.com/watch?v=morHT1mH5Pg&feature=endscreen';
    expect(routeWindowOpen(url)).toEqual({ action: 'music', url });
    expect(routeWindowOpen('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC').action).toBe(
      'music',
    );
  });

  it('sends other web links to the browser and refuses the rest', () => {
    expect(routeWindowOpen('https://www.youtube.com/@channel')).toEqual({ action: 'external' });
    expect(routeWindowOpen('https://support.spotify.com/')).toEqual({ action: 'external' });
    expect(routeWindowOpen('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(routeWindowOpen('file:///etc/passwd')).toEqual({ action: 'deny' });
  });
});
