// What a window the renderer (or a frame inside it) asks to open becomes.
//
// A vendor's embedded player links out with target="_blank": YouTube's "More
// videos" tray, Spotify's "open in app". Those would leave the window for a
// browser tab, when what the person meant was "play this one". A link the
// music grammar accepts that comes FROM one of the embed players is routed
// back to the player. The renderer's own "open in the browser" is its own
// choice and still opens outside, like every other http(s) link; everything
// else is refused.

import { EMBED_FRAME_ORIGINS } from './music';
import { parseMusicLink } from './music-links';

export type WindowOpenRoute =
  { action: 'music'; url: string } | { action: 'external' } | { action: 'deny' };

function fromEmbed(referrer: string): boolean {
  try {
    const origin = new URL(referrer).origin;
    return (EMBED_FRAME_ORIGINS as readonly string[]).includes(origin);
  } catch {
    return false;
  }
}

/** `referrer` is the URL of the document that asked — a frame's, or ours. */
export function routeWindowOpen(url: string, referrer = ''): WindowOpenRoute {
  if (fromEmbed(referrer) && parseMusicLink(url)) return { action: 'music', url };
  if (url.startsWith('https://') || url.startsWith('http://')) return { action: 'external' };
  return { action: 'deny' };
}
