// The vendor's own player, in its own frame. No popups, no top navigation:
// a "Log in" inside the player goes nowhere on purpose, and the copy beside
// the frame says why.

import type { MusicLink } from '@shared/music-links';

export function EmbedFrame({ link, height = 352 }: { link: MusicLink; height?: number }) {
  return (
    <iframe
      key={link.embedUrl}
      src={link.embedUrl}
      title={link.label}
      height={height}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; clipboard-write; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
      className="w-full rounded-xl border-0 bg-secondary/40"
    />
  );
}
