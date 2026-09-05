// The vendor's own player, in its own frame. No top navigation, and a popup
// never becomes a window: every link it opens goes through main's window-open
// handler, which plays a music link here and sends the rest to the browser.
//
// Mounted once, by EmbedHost, and keyed on the link alone: a frame that is
// re-created is a player that starts over.

import { forwardRef } from 'react';
import type { MusicLink } from '@shared/music-links';

export const EmbedFrame = forwardRef<
  HTMLIFrameElement,
  { link: MusicLink; src?: string; onLoad?: () => void }
>(function EmbedFrame({ link, src, onLoad }, ref) {
  return (
    <iframe
      key={link.embedUrl}
      ref={ref}
      src={src ?? link.embedUrl}
      title={link.label}
      onLoad={onLoad}
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; clipboard-write; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
      className="h-full w-full border-0 bg-secondary/40"
    />
  );
});
