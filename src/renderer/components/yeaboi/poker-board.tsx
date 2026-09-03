'use client';

// The poker board itself, running in the app.
//
// Not a picture of it and not a window onto it: this is the same React app the
// teammates' browsers load (yeaboi-frontend's `src/poker`), mounted here. It
// keeps its own look, because it *is* the board — the one thing swapped out is
// its HTTP client, which goes through main so the host secret stays there
// (`src/renderer/board/board-api.ts`).
//
// While it is up the app steps back: the rail, the dock and Niko retreat off
// their edges. The duck stays.

import { useEffect } from 'react';

import { App as PokerApp } from '@board/poker/App';
// As text, not as a stylesheet: the board's tokens are declared on `:root`, and
// applied there they are the same names this app's own theme uses — the window
// lost its type and its colour the moment the board was imported. Rewritten
// onto the board's own container, they reach the board and nothing else.
import tokens from '@board/design/tokens.css?inline';

import { playBoard } from '@/board/board-api';

/** The board's container, and what its tokens are re-rooted onto. */
const HOST = 'board-host';

/** The flag the rail, the dock and Niko read to get out of the way. */
const STAGED = 'boardStaged';

/**
 * The board's boot payload.
 *
 * Python builds this into the served document (`poker/page.py`'s
 * `board_config`); here it is built for the same shape. Static facts only —
 * everything that moves during a session arrives over the board's own state.
 */
function boot(scope: string) {
  return {
    chrome: {
      mode: 'poker',
      frame: 'planning poker',
      wordmark: 'poker',
      title: 'Planning Poker',
      subtitle: scope,
      facts: [['SCOPE', scope]] as Array<[string, string]>,
      footer: 'yeaboi.ai',
    },
    scope,
    adjectives: ['quick', 'quiet', 'bright', 'steady', 'clever', 'calm'],
    nouns: ['otter', 'heron', 'fox', 'moth', 'pike', 'wren'],
    musicChannels: [],
  };
}

export function PokerBoard({ boardId, scope }: { boardId: string; scope: string }) {
  useEffect(() => {
    playBoard(boardId);
    document.documentElement.dataset[STAGED] = boardId;
    const style = document.createElement('style');
    style.dataset['boardTokens'] = '';
    style.textContent = tokens.replaceAll(':root', `.${HOST}`);
    document.head.append(style);
    return () => {
      playBoard('');
      delete document.documentElement.dataset[STAGED];
      style.remove();
    };
  }, [boardId]);

  // The board paints its own surface, in its own palette, and expects to own
  // the page it is on — so it is given a block of the window to own.
  return (
    <div data-mode="poker" className={HOST}>
      <PokerApp boot={boot(scope) as never} />
    </div>
  );
}
