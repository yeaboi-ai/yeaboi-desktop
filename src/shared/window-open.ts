// What a window the renderer (or a frame inside it) asks to open becomes.
//
// A vendor's embedded player links out with target="_blank": YouTube's "More
// videos" tray, Spotify's "open in app". Those would leave the window for a
// browser tab, when what the person meant was "play this one". A link the
// music grammar accepts is routed back to the player; any other http(s) link
// still opens outside; everything else is refused.

import { parseMusicLink } from './music-links';

export type WindowOpenRoute =
  { action: 'music'; url: string } | { action: 'external' } | { action: 'deny' };

export function routeWindowOpen(url: string): WindowOpenRoute {
  if (parseMusicLink(url)) return { action: 'music', url };
  if (url.startsWith('https://') || url.startsWith('http://')) return { action: 'external' };
  return { action: 'deny' };
}
