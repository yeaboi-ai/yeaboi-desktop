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

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

import { App as PokerApp } from '@board/poker/App';
// As text, not as a stylesheet: the board's tokens are declared on `:root`, and
// applied there they are the same names this app's own theme uses — the window
// lost its type and its colour the moment the board was imported. Rewritten
// onto the board's own container, they reach the board and nothing else.
import tokens from '@board/design/tokens.css?inline';

import { playBoard, primeBoard } from '@/board/board-api';
import { participantId } from '@board/runtime/storage';

/** The board's container, and what its tokens are re-rooted onto. */
const HOST = 'board-host';

/**
 * The board wearing this app's colours.
 *
 * Written one class deeper than the board's own tokens on purpose: those are
 * inside an `@scope`, and a scoped rule beats an unscoped one of equal
 * specificity whatever the source order — proximity wins ties. `.board-frame
 * .board-host` outranks `:scope`, which is what makes any of this apply.
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
  --app-popover: var(--popover);
  --app-input: var(--input);
  --app-body: var(--font-body);
  --app-display: var(--font-display);
  --app-code: var(--font-code);
  --app-radius: var(--radius);
  /* The way out of the table is a fixed size so the chips beside it can be
     placed against a number rather than against a guess at its label. */
  --leave-w: 156px;
}
.board-frame .${HOST} {
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
  --panel-2: var(--app-secondary);
  --hairline: color-mix(in srgb, var(--app-line) 70%, transparent);
  --hairline-strong: var(--app-line);
  /* The board tracks its small caps at 0.14em; the app tracks the same labels
     at about half that, and the difference is the loudest thing on a panel. */
  --track-label: 0.06em;

  /* The rest of the house style, not just its colours: the app's faces, its
     radii and its shadows. The board's own are a different design — a pixel
     wordmark over Geist at 4px corners — and a screen of this app should not
     be the only one wearing them. */
  --font-sans: var(--app-body), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--app-code), ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-serif: var(--app-display), Georgia, serif;
  --font-rounded: var(--app-body), ui-sans-serif, system-ui, sans-serif;
  --r-s: calc(var(--app-radius) - 2px);
  --r-m: var(--app-radius);
  --r-l: calc(var(--app-radius) + 4px);
  --edge: none;
  --shadow-1: 0 1px 2px rgb(0 0 0 / 6%), 0 4px 10px rgb(0 0 0 / 6%);
  --shadow-hover: 0 2px 4px rgb(0 0 0 / 8%), 0 10px 22px rgb(0 0 0 / 8%);
  --shadow-2: 0 4px 10px rgb(0 0 0 / 10%), 0 16px 36px rgb(0 0 0 / 14%);

  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
}

/* The controls, in this app's hand.
 *
 * The board draws its own buttons — square-ish, flat, its own type scale — and
 * next to the rest of the app they read as another product's. The shapes are
 * matched here rather than in the board's source: it has its own repo, its own
 * browsers to serve and its own reasons, and none of them are this window. */
.board-frame .${HOST} button:not([class*='avatar'], [class*='icon'], [class*='card'], [class*='pill'], [class*='chip'], [class*='round']),
.board-frame .${HOST} [role='button']:not([class*='avatar'], [class*='icon'], [class*='card'], [class*='pill'], [class*='chip'], [class*='round']) {
  border-radius: var(--app-radius);
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    border-color 150ms ease;
}

.board-frame .${HOST} button:active {
  transform: translateY(1px);
}

.board-frame .${HOST} input,
.board-frame .${HOST} select,
.board-frame .${HOST} textarea {
  border-radius: var(--app-radius);
  font-family: var(--font-sans);
  font-size: 12.5px;
}

/* Cards, panels and the sections either side: the app rounds its containers
   twice as far as its controls. */
.board-frame .${HOST} [class*='card'],
.board-frame .${HOST} [class*='panel'],
.board-frame .${HOST} [class*='modal'],
.board-frame .${HOST} [class*='sheet'] {
  border-radius: calc(var(--app-radius) * 2);
}

/* The window's own top edge belongs to the window.
 *
 * The board's shell is fixed to the whole viewport — right in a browser tab,
 * and here it puts the masthead under the traffic lights. It starts below
 * the titlebar instead, and gives up the rounded
 * bottom and the shadow it paints its own screen edge with: this app already
 * draws the window it is in. */
.board-frame .${HOST} [class*='shellApp'] {
  /* The page paints the window's corners itself, and this is fixed to the
     viewport — so the body's clip never reaches it and a square shell cuts
     them back off. Same curve. */
  border-radius: var(--window-radius);
  box-shadow: none;
}

/* The top bar, as the app's chrome rather than a bar.
 *
 * It was a full-width panel with a hairline around it, holding a title at one
 * end and two chips at the other and a thousand pixels of nothing between —
 * furniture drawn as if it were content. This app never draws that: what
 * floats over a page here is a capsule around the thing itself and nothing
 * else. So the band goes and its contents become capsules on the board's own
 * ground, the way the dock at the bottom of every other screen is. */
.board-frame .${HOST} [class*='chromeApp'] {
  /* Nothing left to draw. The board's name was a capsule saying what the
     window already says, and a strip's worth of height to say it in; the
     board starts at the top of the screen instead. The element stays, at no
     height, because the identity chips are fixed out of it. */
  height: 0;
  margin: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.board-frame .${HOST} [class*='mastheadApp'],
.board-frame .${HOST} [class*='chromeApp'] [class*='brandMark'] {
  display: none;
}

.board-frame .${HOST} [class*='appbar'] {
  height: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

/* And the board takes the space back, stopping only where the window buttons
   are — they sit above y=30, so this clears them. Full screen has no window
   buttons to clear, so it starts at the top. */
.board-frame .${HOST} [class*='_layout_'] {
  padding-top: var(--titlebar-h);
}

:root[data-full-screen] .board-frame .${HOST} [class*='_layout_'] {
  padding-top: 12px;
}

/* Who you are and who else is here sits with the rest of the furniture, on
   the bottom row beside the way out — not opposite the board's name, where
   two chips at the far end of an empty strip were all that kept the top a
   bar. Their list opens upward from there, since there is nothing below it to
   open into. */
.board-frame .${HOST} [class*='chromeApp'] [class*='identity'] {
  position: fixed;
  left: calc(16px + var(--leave-w) + 8px);
  bottom: 16px;
  z-index: 45;
  /* The row's height, so the chips centre on the same line as the pill beside
     them rather than sitting on its floor. */
  height: 34px;
  gap: 8px;
  align-items: center;
}

.board-frame .${HOST} [class*='identity'] [class*='roomList'] {
  top: auto;
  bottom: calc(100% + 6px);
  padding-top: 0;
  padding-bottom: 20px;
}

/* Who you are and who else is here: two more of the same capsule. */
.board-frame .${HOST} [class*='chromeApp'] [class*='meChip'],
.board-frame .${HOST} [class*='chromeApp'] [class*='presenceChip'] {
  height: 26px;
  /* The board floors every control at its tap target, and the shared control
     rule below is a class more specific than this one was — hence the extra
     step and the min. */
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: calc(var(--app-radius) * 2);
  background: color-mix(in srgb, var(--app-card) 85%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-line) 60%, transparent);
  backdrop-filter: blur(12px);
  color: var(--app-muted);
}

.board-frame .${HOST} [class*='chromeApp'] [class*='meChip']:hover,
.board-frame .${HOST} [class*='chromeApp'] [class*='presenceChip']:hover {
  color: var(--app-text);
}

/* The ticket pager: two round steps either side of the count, the way every
   small icon control in the app is round. */
.board-frame .${HOST} [class*='tknav'] button {
  border-radius: 999px;
}

/* Everything that opens out of the chrome.
 *
 * The board's panels are opaque with a hairline border and a small radius; the
 * app's are a translucent card at the larger radius, ringed rather than
 * bordered, over a blurred page. Same grammar for the popovers, the dropdown
 * menus and the modals, because in the app they are one object. */
.board-frame .${HOST} [class*='popover']:not([class*='Anchor']),
.board-frame .${HOST} [class*='ddMenu'],
.board-frame .${HOST} [class*='modalCard'],
.board-frame .${HOST} [class*='sheet'] {
  padding: 12px;
  border: 0;
  border-radius: calc(var(--app-radius) + 4px);
  background: color-mix(in srgb, var(--app-popover) 92%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--app-line) 70%, transparent),
    0 24px 48px -12px rgb(0 0 0 / 45%);
  backdrop-filter: blur(14px);
}

/* Fields, at the app's input size — every one of them.
 *
 * The board writes some of its fields as boxes and some as a rule under the
 * text: the ticket editor's title, body and points were underlines sitting
 * beside three boxed dropdowns, which is two kinds of field in one form and
 * reads as unfinished. They are all the app's input here: a hairline box on a
 * faint fill, at one height. */
.board-frame .${HOST} [class*='ddTrigger'],
.board-frame .${HOST} select,
.board-frame .${HOST} input:not([type='range'], [type='checkbox'], [type='radio']) {
  height: 32px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--app-input);
  border-radius: var(--app-radius);
  background: color-mix(in srgb, var(--app-input) 30%, transparent);
  box-shadow: none;
  color: var(--app-text);
  font-size: 12.5px;
}

/* Same skin, but a box that grows: a textarea's height is its content's. */
.board-frame .${HOST} textarea {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--app-input);
  border-radius: var(--app-radius);
  background: color-mix(in srgb, var(--app-input) 30%, transparent);
  box-shadow: none;
  color: var(--app-text);
}

/* The one being edited is still the ticket's name. */
.board-frame .${HOST} [class*='editTitle'] {
  font-size: 15px;
  font-weight: 500;
}

.board-frame .${HOST} [class*='ddTrigger']:hover,
.board-frame .${HOST} [class*='ddTrigger'][aria-expanded='true'],
.board-frame .${HOST} textarea:focus,
.board-frame .${HOST} input:focus:not([type='range']) {
  border-color: color-mix(in srgb, var(--app-accent) 60%, var(--app-line));
  box-shadow: none;
  outline: none;
}

/* The rows in a menu, from the rail: a soft box under the cursor, and the
   accent kept for the one that is chosen. */
.board-frame .${HOST} [class*='ddOpt'] {
  border-radius: var(--app-radius);
  padding: 6px 9px;
  font-size: 12.5px;
  color: var(--app-muted);
}

.board-frame .${HOST} [class*='ddOpt']:hover,
.board-frame .${HOST} [class*='ddOptActive'] {
  background: var(--app-secondary);
  color: var(--app-text);
}

.board-frame .${HOST} [class*='ddOpt'][aria-selected='true'] {
  color: var(--app-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 70%, transparent);
}

/* The slider, at the app's weight: a hairline track with the accent filling
   it, and a small pale thumb rather than a large accent one. */
.board-frame .${HOST} [class*='range']::-webkit-slider-runnable-track {
  height: 4px;
}

.board-frame .${HOST} [class*='range']::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border: 1px solid color-mix(in srgb, var(--app-accent) 70%, transparent);
  background: #fff;
}

/* A panel's own button is the app's secondary: filled, unbordered, quiet. */
.board-frame .${HOST} [class*='popover']:not([class*='Anchor']) button:not([class*='Primary'], [class*='swatch'], [class*='musicPlay'], [class*='ddOpt'], [class*='ddTrigger']),
.board-frame .${HOST} [class*='panelAction'] {
  height: 32px;
  border: 0;
  border-radius: var(--app-radius);
  background: var(--app-secondary);
  color: var(--app-text);
}

.board-frame .${HOST} [class*='popover']:not([class*='Anchor']) button:not([class*='Primary'], [class*='swatch'], [class*='musicPlay'], [class*='ddOpt'], [class*='ddTrigger']):hover,
.board-frame .${HOST} [class*='panelAction']:hover {
  background: color-mix(in srgb, var(--app-secondary) 80%, var(--app-text) 8%);
}

/* Full screen: the table comes up to meet the ticket.
 *
 * The ticket is the one thing in the middle column that grows, and the board
 * pushes the table down with an auto margin — an arrangement that reads well
 * in a window and, on a screen this tall, leaves half of it empty with the
 * people and their hand pressed against the bottom edge. On a full screen the
 * ticket takes the height it needs (it has its own scroll and its own floor)
 * and the group sits under it. */
:root[data-full-screen] .board-frame .${HOST} [class*='_main_'] > [class*='_ticket_'] {
  flex: 0 1 auto;
}

:root[data-full-screen] .board-frame .${HOST} [class*='_main_'] > [class*='_table_'] {
  margin-top: 48px;
}

/* The board's dock, in the app's floating chrome.
 *
 * Everything this app floats over a page — the rail, the row of controls at
 * the bottom — is the same object: a translucent card at twice the control
 * radius, a hairline ring rather than a border, a soft drop shadow, and the
 * page blurred behind it. The board's own dock is a flat panel with a solid
 * fill and a 1px line, which next to the rest reads as a different surface.
 * These are the same values, written in the board's names. */
.board-frame .${HOST} [class*='dockApp'] {
  /* Both floating things on this row sit 16px off their own edge, so the row
     reads as one. The board parks its dock on a 28px gutter measured in its
     own JS, and the translate property composes with the transform that
     placement rides on — so the rest position moves without taking the drag
     with it. */
  bottom: 16px;
  translate: 12px 0;
  border: 0;
  border-radius: calc(var(--app-radius) * 2);
  background: color-mix(in srgb, var(--app-card) 85%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--app-line) 60%, transparent),
    0 20px 25px -5px rgb(0 0 0 / 28%),
    0 8px 10px -6px rgb(0 0 0 / 24%);
  backdrop-filter: blur(12px);
}

.board-frame .${HOST} [class*='dockApp'] [class*='dockRow'] {
  padding: 4px;
  gap: 2px;
}

/* The items on it: the rail's rows, at the rail's size and radius. Quiet
   until the cursor is on them. */
.board-frame .${HOST} [class*='dockApp'] [class*='dockRow'] button:not([class*='btnPrimary']) {
  min-width: 26px;
  height: 26px;
  /* The board floors every control at its tap target, which is what kept the
     row 32 tall however short the buttons were told to be. */
  min-height: 26px;
  padding: 0 7px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-muted);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.board-frame .${HOST} [class*='dockApp'] [class*='dockRow'] button:not([class*='btnPrimary']):hover {
  background: color-mix(in srgb, var(--app-secondary) 60%, transparent);
  color: var(--app-text);
}

.board-frame .${HOST} [class*='dockApp'] [class*='dockRow'] svg {
  width: 14px;
  height: 14px;
}

/* The grip is a handle, not a control — it stays at the weight of a label,
   and at the row's height so it does not set it. */
.board-frame .${HOST} [class*='dockGrip'] {
  height: 26px;
  color: color-mix(in srgb, var(--app-muted) 60%, transparent);
}

/* The one filled thing on the row. Same height as everything beside it, so
   the row has one baseline the way the app's own does. */
.board-frame .${HOST} [class*='dockApp'] [class*='btnPrimary'] {
  height: 26px;
  min-height: 26px;
  padding: 0 11px;
  border: 0;
  /* Round, like the steps it sits beside on the same row. */
  border-radius: 999px;
  font-weight: 500;
}

/* The masthead. The board's wordmark is pixel-art vector, not text — no font
   rule reaches it — and it sits next to a title that already says the same
   word. Inside this app the title is the mark, set in the app's display face;
   the board keeps its own logo for the browsers it is served to. */
.board-frame .${HOST} svg[class*='wordmark'] {
  display: none;
}

.board-frame .${HOST} h1[class*='title'] {
  font-family: var(--app-display), Georgia, serif;
  font-size: 14.5px;
  font-weight: 400;
  letter-spacing: 0.01em;
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

/** The board's own key for who you are, so the snapshot read here is read as
 *  the same participant the board is about to be. */
const PID_KEY = 'poker_pid';

export function PokerBoard({
  boardId,
  scope,
  onLeave,
}: {
  boardId: string;
  scope: string;
  onLeave: () => void;
}) {
  // The table arrives once. The board is held back until its first snapshot is
  // in hand — otherwise the shell paints from an empty store and everything in
  // the room animates in a second time when the poll lands.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    playBoard(boardId);
    // A board that will not answer is still a board: it gets to mount and show
    // its own reconnecting state rather than leaving the window empty.
    primeBoard(boardId, participantId(PID_KEY)).then(
      () => live && setReady(true),
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
  }, [boardId]);

  useEffect(() => {
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
    // A definite height, all the way down. The board's own layout is a column
    // of 100%-height boxes, and on a surface that no longer scrolls that chain
    // resolved against `auto` — everything in normal flow came out zero-high
    // and the only things left on screen were the ones painted `fixed`.
    <div className="board-frame flex min-h-0 flex-1 flex-col">
      <div
        data-mode="poker"
        className={`${HOST} min-h-0 flex-1 transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {ready && <PokerApp boot={boot(scope) as never} />}
      </div>
      {/* The way out, where the app's own dock would be. The board owns the
          window while it is up, so this is the one piece of the app left on
          screen besides the duck. */}
      <button
        type="button"
        onClick={onLeave}
        className="fixed bottom-4 left-4 z-[60] flex h-[34px] w-[var(--leave-w)] items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-card/85 px-4 font-body text-[12px] text-muted-foreground shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-colors hover:text-foreground"
      >
        <LogOut className="h-[13px] w-[13px]" />
        Leave the table
      </button>
    </div>
  );
}
