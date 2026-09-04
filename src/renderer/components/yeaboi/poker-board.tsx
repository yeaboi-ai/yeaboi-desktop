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
import { LogOut } from 'lucide-react';

import { App as PokerApp } from '@board/poker/App';
// As text, not as a stylesheet: the board's tokens are declared on `:root`, and
// applied there they are the same names this app's own theme uses — the window
// lost its type and its colour the moment the board was imported. Rewritten
// onto the board's own container, they reach the board and nothing else.
import tokens from '@board/design/tokens.css?inline';

import { playBoard } from '@/board/board-api';

/** The board's container, and what its tokens are re-rooted onto. */
const HOST = 'board-host';

/**
 * The board wearing this app's colours.
 *
 * The board's palette is its own — five themes, switched on `[data-theme]`,
 * with `--bg`/`--panel`/`--text` at the bottom of everything it draws. Left
 * alone it arrives in midnight while the window around it is in whatever the
 * app is set to, which reads as a second application rather than a screen of
 * this one. The app's values are captured on the frame and handed to the board
 * under its own names — one hop, because a token cannot be defined in terms of
 * itself.
 */
const INHERIT = `
.board-frame {
  --app-bg: var(--background);
  --app-panel: var(--card);
  --app-card: var(--card);
  --app-line: var(--border);
  --app-text: var(--foreground);
  --app-muted: var(--muted-foreground);
  --app-accent: var(--primary);
  --app-secondary: var(--secondary);
}
.${HOST} {
  --bg: var(--app-bg);
  --panel: var(--app-panel);
  --card: var(--app-card);
  --line: var(--app-line);
  --text: var(--app-text);
  --muted: var(--app-muted);
  --dim: color-mix(in srgb, var(--app-muted) 70%, transparent);
  --accent: var(--app-accent);
  --accent2: var(--app-accent);
  --ink: var(--app-bg);
  color: var(--text);
  background: var(--bg);
}
`;

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

export function PokerBoard({
  boardId,
  scope,
  onLeave,
}: {
  boardId: string;
  scope: string;
  onLeave: () => void;
}) {
  useEffect(() => {
    playBoard(boardId);
    document.documentElement.dataset[STAGED] = boardId;
    const style = document.createElement('style');
    style.dataset['boardTokens'] = '';
    // Scoped, not merely re-rooted. The board's stylesheet carries element
    // rules of its own — `:where(button, input, …)` and the rest — and applied
    // to the document they restyle the app around it: the way out of the table
    // came back as a bare grey rectangle. `@scope` keeps every rule inside the
    // board's own subtree. Faces have to be hoisted out: `@font-face` is only
    // valid at the top level.
    const faces = tokens.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const rest = tokens.replace(/@font-face\s*\{[^}]*\}/g, '');
    style.textContent = [
      ...faces,
      `@scope (.${HOST}) {\n${rest.replaceAll(':root', ':scope')}\n}`,
      INHERIT,
    ].join('\n');
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
    <div className="board-frame">
      <div data-mode="poker" className={HOST}>
        <PokerApp boot={boot(scope) as never} />
      </div>
      {/* The way out, where the app's own dock would be. The board owns the
          window while it is up, so this is the one piece of the app left on
          screen besides the duck. */}
      <button
        type="button"
        onClick={onLeave}
        className="fixed bottom-4 left-3 z-[60] flex items-center gap-2 rounded-full bg-popover px-4 py-2 font-body text-[12px] text-muted-foreground shadow-xl ring-1 ring-border/60 transition-colors hover:text-foreground"
      >
        <LogOut className="h-[13px] w-[13px]" />
        Leave the table
      </button>
    </div>
  );
}
