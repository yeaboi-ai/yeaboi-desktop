// Links a frame opens: a music link comes back to the player, the rest leave.

import { describe, expect, it } from 'vitest';
import { routeWindowOpen } from '../src/shared/window-open';

const YT_FRAME = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1';
const SP_FRAME = 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?theme=0';
const APP = 'app://yeaboi/index.html';

describe('routeWindowOpen', () => {
  it("plays YouTube's tray and end-screen links when the frame opens them", () => {
    const url = 'https://www.youtube.com/watch?v=morHT1mH5Pg&feature=endscreen';
    expect(routeWindowOpen(url, YT_FRAME)).toEqual({ action: 'music', url });
    expect(
      routeWindowOpen('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', SP_FRAME).action,
    ).toBe('music');
  });

  it("keeps the app's own 'open in the browser' outside", () => {
    // The person chose "browser" for this service; that choice is honoured.
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(routeWindowOpen(url, APP)).toEqual({ action: 'external' });
    expect(routeWindowOpen(url, 'http://localhost:5173/')).toEqual({ action: 'external' });
    expect(routeWindowOpen(url, '')).toEqual({ action: 'external' });
    expect(routeWindowOpen(url, 'not a url')).toEqual({ action: 'external' });
  });

  it('sends other web links to the browser and refuses the rest', () => {
    expect(routeWindowOpen('https://www.youtube.com/@channel', YT_FRAME)).toEqual({
      action: 'external',
    });
    expect(routeWindowOpen('https://support.spotify.com/', APP)).toEqual({ action: 'external' });
    expect(routeWindowOpen('javascript:alert(1)', YT_FRAME)).toEqual({ action: 'deny' });
    expect(routeWindowOpen('file:///etc/passwd', APP)).toEqual({ action: 'deny' });
  });
});
