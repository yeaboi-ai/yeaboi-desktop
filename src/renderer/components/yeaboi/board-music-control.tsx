'use client';

// The window's own player, in the row the board keeps for one.
//
// The board has a music control of its own — a note that opens a panel of
// three fields — and it is the right one when the board is a page in
// somebody's browser. In this window there is already a player, and it is the
// one on the dock: a note that slides out into the transport with the spectrum
// floating above it. That is what goes here.
//
// The only thing the window's player has no notion of is the room: putting a
// station on for everyone in it is the board's, and it takes the place of the
// way through to the Music page, which is not reachable from inside a board.

import { Megaphone } from 'lucide-react';

import { MusicPocket } from '@/components/nav/dock-music';

export function BoardMusicControl({ cast }: { cast?: (() => void) | undefined }) {
  return (
    // The board's stylesheet is `@scope`d and stops here: a scoped reset beats
    // an unscoped class by proximity, and without the limit every control in
    // the app's own chrome came out with the board's zeroed padding.
    <div data-app-chrome className="flex items-center">
      <MusicPocket
        trailing={
          cast ? (
            <button
              type="button"
              title="Play for everyone"
              aria-label="Play for everyone"
              onClick={cast}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Megaphone className="size-3.5" aria-hidden />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
