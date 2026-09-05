'use client';

// A board of this app's own, played in the window.
//
// Not a picture of one and not a window onto one: this is the same React app
// the teammates' browsers load (yeaboi-frontend's `src/poker`, `src/retro`),
// mounted here. It keeps its own look, because it *is* the board — the one
// thing swapped out is its HTTP client, which goes through main so the host
// secret stays there (`src/renderer/board/board-api.ts`).
//
// While a board is up the app steps back: the rail, the dock and Niko retreat
// off their edges. The duck stays.
//
// The dressing below is the shared board kit's, not one ceremony's: poker and
// retro compose the same `shared/` library, so a rule written against the
// chrome, the dock, the modals or the menus reaches both. What is genuinely
// one ceremony's — poker's ticket pager and its three-column table — is named
// after classes the other board does not have, and simply matches nothing
// there.

import { useEffect, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';

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
/* On the root, not on the frame. The boards portal onto document.body — the
   card in the air, the reaction tray, a dropdown menu, the announce banner —
   and anything hung off body is outside the frame. Every name here is
   prefixed, so nothing on the root collides with the app's own. */
:root {
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
}
/* The board's own names, wherever the board is. A portal's root carries the
   board's CSS-module classes, which this bundler always mints with a leading
   underscore; the app's own body children are Tailwind and never do. */
.board-frame .${HOST},
body > [class^='_'] {
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
 * browsers to serve and its own reasons, and none of them are this window.
 *
 * Shape and type only. Nothing here declares a transition or touches the
 * active state, and both used to: a transition shorthand replaces the property
 * list rather than adding to it, so naming three colours took transform,
 * box-shadow and opacity off every control the board animates — the press on a
 * button, the lift on an avatar, the nudge on the music play. The board's
 * motion is the board's; this is only what it is wearing. */
/* The board tracks its small caps at 0.14em; the app tracks the same labels at
   about half that, and on poker's panels the difference is the loudest thing
   on them. Retro's mono labels are its column headings — the tracking is the
   look, and halving it is not a smaller version of it. */
.board-frame .${HOST}[data-mode='poker'] {
  --track-label: 0.06em;
}

.board-frame .${HOST}[data-mode='poker'] button:not([class*='avatar' i], [class*='icon' i], [class*='card' i], [class*='pill' i], [class*='chip' i], [class*='round' i]),
.board-frame .${HOST}[data-mode='poker'] [role='button']:not([class*='avatar' i], [class*='icon' i], [class*='card' i], [class*='pill' i], [class*='chip' i], [class*='round' i]) {
  border-radius: var(--app-radius);
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0;
}

.board-frame .${HOST}[data-mode='poker'] input,
.board-frame .${HOST}[data-mode='poker'] select,
.board-frame .${HOST}[data-mode='poker'] textarea {
  border-radius: var(--app-radius);
  font-family: var(--font-sans);
  font-size: 12.5px;
}

/* Cards, panels and the sections either side: the app rounds its containers
   twice as far as its controls.
 
   Poker's, because the boards already take their radii from the app through
   --r-s/--r-m/--r-l above, and a second answer here only contradicts the
   first: a retro card asks for --r-l and came out four pixels rounder than
   the board that drew it. */
.board-frame .${HOST}[data-mode='poker'] [class*='card'],
.board-frame .${HOST}[data-mode='poker'] [class*='panel'],
.board-frame .${HOST}[data-mode='poker'] [class*='modal'],
.board-frame .${HOST}[data-mode='poker'] [class*='sheet'] {
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
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] {
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

.board-frame .${HOST}[data-mode='poker'] [class*='mastheadApp'],
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='brandMark'] {
  display: none;
}

.board-frame .${HOST}[data-mode='poker'] [class*='appbar'] {
  height: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

/* And the board takes the space back, stopping only where the window buttons
   are — they sit above y=30, so this clears them. Full screen has no window
   buttons to clear, so it starts at the top. The foot of it lands on the line
   the bottom row sits on, so the hand and the controls read as one edge. */
/* A flex item is as tall as its content unless it is told it may be shorter,
   and every box between the board's shell and its columns is one — so a
   notice appearing in any column grew the whole chain and pushed the hand off
   the bottom, which is what the shell then found to scroll. */
.board-frame .${HOST} [class*='_container_'],
.board-frame .${HOST} [class*='_scroll_'] {
  min-height: 0;
}

/* And the shell has nothing to scroll. Locking the vote slides the hand off
   the bottom edge on purpose — the board pulls it down by a negative margin,
   which leaves the cards hanging past the window and the shell offering a bar
   to chase them with. The rail and the round scroll on their own; this is the
   window, and the window does not move. */
.board-frame .${HOST} [class*='_scroll_'] {
  overflow: hidden;
}

.board-frame .${HOST} [class*='_layout_'],
.board-frame .${HOST} [class*='Layout_'] {
  min-height: 0;
  padding-top: var(--titlebar-h);
  padding-bottom: 16px;
  /* One row, and never taller than the board. Its height was its tallest
     column's, so a notice appearing in one of them grew the row, grew the
     middle column with it, and pushed the hand off the bottom — which is what
     the shell then found to scroll. */
  grid-template-rows: minmax(0, 1fr);
}

:root[data-full-screen] .board-frame .${HOST} [class*='_layout_'],
:root[data-full-screen] .board-frame .${HOST} [class*='Layout_'] {
  padding-top: 12px;
}

/* The room opens upward, so its cards come up. The board deals them down from
   under the bar it hangs from — the same distance, the other way. */
.board-frame .${HOST}[data-mode='poker'] [class*='identity'] [class*='roomCard'] {
  transform: translateY(calc(var(--card-h) + var(--room-gap)));
}

.board-frame .${HOST}[data-mode='poker'] [class*='identity'] [class*='room']:hover [class*='roomCard'],
.board-frame .${HOST}[data-mode='poker'] [class*='identity'] [class*='room']:has(:focus-visible) [class*='roomCard'] {
  transform: none;
}

/* The scope's own name. The app already says which session this is, on the
   surface the table was dealt from. */
.board-frame .${HOST}[data-mode='poker'] [class*='railScope'] {
  display: none;
}

/* Invite is the one filled thing on the row and reads as itself. */
.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='btnPrimary'] [class*='iconLabel'] {
  display: none;
}

.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='btnPrimary'] {
  width: 26px;
  padding: 0;
}

/* Who you are and who else is here closes the bottom row, opposite the way
   out and the controls — not the top, where two chips at the far end of an
   empty strip were all that kept it a bar. Their list opens upward, since
   there is nothing below it to open into. */
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='identity'] {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 45;
  /* The row's height, so the chips centre on the same line as the pill beside
     them rather than sitting on its floor. */
  height: 34px;
  gap: 8px;
  align-items: center;
}

/* Anchored to the row, and to its right-hand end — the chips close the bottom
   row, so what comes off them lines up with the edge they sit against. */
.board-frame .${HOST}[data-mode='poker'] [class*='identity'] [class*='roomList'] {
  top: auto;
  right: 0;
  left: auto;
  bottom: 100%;
  padding-top: 0;
  padding-bottom: 8px;
  align-items: flex-end;
  /* The board hides the cards behind the edge they deal from, and that edge
     was the top. It is the bottom here, so the top card kept losing its head
     to an inset meant for a list that opens the other way. */
  clip-path: inset(-40px -40px 0);
}

.board-frame .${HOST}[data-mode='poker'] [class*='identity'] [class*='roomCard'] {
  margin-left: auto;
}

/* Who you are and who else is here: two more of the same capsule. */
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='meChip'],
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='presenceChip'] {
  /* The height of the row's other end: the way out and the controls beside it
     are 34, and a chip half a step shorter reads as a different row. */
  height: 34px;
  /* The board floors every control at its tap target, and the shared control
     rule below is a class more specific than this one was — hence the extra
     step and the min. */
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: calc(var(--app-radius) * 2);
  background: color-mix(in srgb, var(--app-card) 85%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-line) 60%, transparent);
  backdrop-filter: blur(12px);
  color: var(--app-muted);
}

.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='meChip']:hover,
.board-frame .${HOST}[data-mode='poker'] [class*='chromeApp'] [class*='presenceChip']:hover {
  color: var(--app-text);
}

/* The ticket pager: two round steps either side of the count, the way every
   small icon control in the app is round. */
.board-frame .${HOST}[data-mode='poker'] [class*='tknav'] button {
  border-radius: 999px;
}

/* Everything that opens out of the chrome.
 *
 * The board's panels are opaque with a hairline border and a small radius; the
 * app's are a translucent card at the larger radius, ringed rather than
 * bordered, over a blurred page. Same grammar for the popovers, the dropdown
 * menus and the modals, because in the app they are one object. */
.board-frame .${HOST}[data-mode='poker'] [class*='popover']:not([class*='Anchor']),
.board-frame .${HOST}[data-mode='poker'] [class*='ddMenu'],
.board-frame .${HOST}[data-mode='poker'] [class*='modalCard'],
.board-frame .${HOST}[data-mode='poker'] [class*='sheet'] {
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
.board-frame .${HOST}[data-mode='poker'] [class*='ddTrigger'],
.board-frame .${HOST}[data-mode='poker'] select,
.board-frame .${HOST}[data-mode='poker'] input:not([type='range'], [type='checkbox'], [type='radio']) {
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

/* Same skin, but a box that grows: a textarea's height is its content's.
 *
 * Poker's, because poker's are loose fields in a form. Retro writes its cards
 * into a bare textarea inside a box it rings itself, in the column's own
 * colour — given a box of its own that came out as a border inside a border. */
.board-frame .${HOST}[data-mode='poker'] textarea {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--app-input);
  border-radius: var(--app-radius);
  background: color-mix(in srgb, var(--app-input) 30%, transparent);
  box-shadow: none;
  color: var(--app-text);
}

/* The one being edited is still the ticket's name. */
.board-frame .${HOST}[data-mode='poker'] [class*='editTitle'] {
  font-size: 15px;
  font-weight: 500;
}

.board-frame .${HOST}[data-mode='poker'] [class*='ddTrigger']:hover,
.board-frame .${HOST}[data-mode='poker'] [class*='ddTrigger'][aria-expanded='true'],
.board-frame .${HOST}[data-mode='poker'] textarea:focus,
.board-frame .${HOST}[data-mode='poker'] input:focus:not([type='range']) {
  border-color: color-mix(in srgb, var(--app-accent) 60%, var(--app-line));
  box-shadow: none;
  outline: none;
}

/* A dialog, the way this app draws one.
 *
 * The board's is a wide dark slab on a black scrim: a bold heading, a grid of
 * emoji at 36px, and a solid gold bar across the foot for a button. The app's
 * dialogs are small, sit on the page's own ground behind a hairline ring, and
 * put their actions at the end of a row rather than across it. */
.board-frame .${HOST}[data-mode='poker'] [class*='_modal_'] {
  border: 0;
  border-radius: calc(var(--app-radius) + 4px);
  background: var(--app-bg);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--app-text) 10%, transparent),
    var(--shadow-2);
}

.board-frame .${HOST}[data-mode='poker'] [class*='_modal_']::backdrop {
  background: rgb(0 0 0 / 20%);
  backdrop-filter: blur(2px);
}

.board-frame .${HOST}[data-mode='poker'] [class*='modalBody'] {
  padding: 16px;
  gap: 12px;
}

.board-frame .${HOST}[data-mode='poker'] [class*='modalTitle'] {
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0;
}

/* The faces, as a tray of tiles rather than a wall of emoji: the app's control
   height, the app's corner, and the one that is chosen wearing the accent as a
   ring instead of a fill. */
.board-frame .${HOST}[data-mode='poker'] [class*='avatarGrid'] {
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}

.board-frame .${HOST}[data-mode='poker'] [class*='avatarChoice'] {
  width: auto;
  height: 34px;
  min-height: 34px;
  border-radius: var(--app-radius);
  background: transparent;
  font-size: 19px;
  line-height: 1;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.board-frame .${HOST}[data-mode='poker'] [class*='avatarChoice']:hover {
  background: var(--app-secondary);
  transform: none;
}

.board-frame .${HOST}[data-mode='poker'] [class*='avatarChoiceOn'] {
  background: var(--app-secondary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 55%, transparent);
}

/* The action goes at the end of its row, at the size of every other button
   here — not a bar the width of the dialog. */
.board-frame .${HOST}[data-mode='poker'] [class*='modalActions'] {
  justify-content: flex-end;
  margin-top: 0;
}

.board-frame .${HOST}[data-mode='poker'] [class*='modalActions'] > * {
  flex: 0 0 auto;
  width: auto;
  min-width: 84px;
  padding: 0 12px;
}

/* Who you are opens off the chip that says it, the way the room does — the
   name and the face belong to that corner, not to the middle of the table. */
.board-frame .${HOST}[data-mode='poker'] [class*='_modal_']:has([class*='avatarGrid']) {
  position: fixed;
  inset: auto 16px 58px auto;
  width: 360px;
  max-width: calc(100vw - 32px);
  margin: 0;
}

/* The die beside the name field is an icon button, not a filled one. */
.board-frame .${HOST}[data-mode='poker'] [class*='inputAction'] {
  width: 32px;
  padding: 0;
  border: 1px solid var(--app-input);
  background: transparent;
  color: var(--app-muted);
}

.board-frame .${HOST}[data-mode='poker'] [class*='inputAction']:hover {
  background: var(--app-secondary);
  color: var(--app-text);
}

/* The rows in a menu, from the rail: a soft box under the cursor, and the
   accent kept for the one that is chosen. */
.board-frame .${HOST}[data-mode='poker'] [class*='ddOpt'] {
  border-radius: var(--app-radius);
  padding: 6px 9px;
  font-size: 12.5px;
  color: var(--app-muted);
}

.board-frame .${HOST}[data-mode='poker'] [class*='ddOpt']:hover,
.board-frame .${HOST}[data-mode='poker'] [class*='ddOptActive'] {
  background: var(--app-secondary);
  color: var(--app-text);
}

.board-frame .${HOST}[data-mode='poker'] [class*='ddOpt'][aria-selected='true'] {
  color: var(--app-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 70%, transparent);
}

/* The slider, at the app's weight: a hairline track with the accent filling
   it, and a small pale thumb rather than a large accent one. */
.board-frame .${HOST}[data-mode='poker'] [class*='range']::-webkit-slider-runnable-track {
  height: 4px;
}

.board-frame .${HOST}[data-mode='poker'] [class*='range']::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border: 1px solid color-mix(in srgb, var(--app-accent) 70%, transparent);
  background: #fff;
}

/* A panel's own button is the app's secondary: filled, unbordered, quiet. */
.board-frame .${HOST}[data-mode='poker'] [class*='popover']:not([class*='Anchor']) button:not([class*='Primary'], [class*='swatch'], [class*='musicPlay'], [class*='ddOpt'], [class*='ddTrigger']),
.board-frame .${HOST}[data-mode='poker'] [class*='panelAction'] {
  height: 32px;
  border: 0;
  border-radius: var(--app-radius);
  background: var(--app-secondary);
  color: var(--app-text);
}

.board-frame .${HOST}[data-mode='poker'] [class*='popover']:not([class*='Anchor']) button:not([class*='Primary'], [class*='swatch'], [class*='musicPlay'], [class*='ddOpt'], [class*='ddTrigger']):hover,
.board-frame .${HOST}[data-mode='poker'] [class*='panelAction']:hover {
  background: color-mix(in srgb, var(--app-secondary) 80%, var(--app-text) 8%);
}

/* The ticket pager goes. The rail beside it is the whole list, named, with
   the one under discussion marked — a pair of arrows and a count is a second
   way to do what is already on screen. */
.board-frame .${HOST}[data-mode='poker'] [class*='tknav'] button {
  display: none;
}

/* The poker table's three columns, each holding its own middle. Scoped to the
 * one board that has them: retro's rail is named the same and runs the height
 * of its own board, where centring it would hang it in mid-air.
 *
 * The rail and the aside are as tall as they need to be and no taller, so on a
 * screen this size they sat at the top of a column of nothing. They take the
 * centre of the space instead. The middle column keeps its own arrangement —
 * ticket at the top, the table and the hand at the bottom — and starts a
 * little lower, clear of the row above it. */
.board-frame .${HOST}[data-mode='poker'] [class*='_rail_'],
.board-frame .${HOST}[data-mode='poker'] [class*='_aside_'] {
  align-self: center;
}

.board-frame .${HOST}[data-mode='poker'] [class*='_main_'] {
  min-height: 0;
  /* And no taller than the row it is in. It was outgrowing it whenever the
     board grew a line — locking the vote, most visibly — and taking the hand
     off the bottom of the screen with it. */
  max-height: 100%;
  padding-top: 24px;
}

/* The ticket takes the height it needs and no more. It was laid out to fill
   the column, which made it as tall as whatever the tallest column happened
   to be — so a notice appearing anywhere on the board grew it, and the hand
   went off the bottom with the shell finding something to scroll. The table
   and the hand keep their own place at the foot of the column. */
.board-frame .${HOST}[data-mode='poker'] [class*='_main_'] > [class*='_ticket_'] {
  flex: 0 1 auto;
  min-height: 0;
}

.board-frame .${HOST}[data-mode='poker'] [class*='_main_'] > [class*='_table_'] {
  margin-top: auto;
}

/* The board's dock, in the app's floating chrome.
 *
 * Everything this app floats over a page — the rail, the row of controls at
 * the bottom — is the same object: a translucent card at twice the control
 * radius, a hairline ring rather than a border, a soft drop shadow, and the
 * page blurred behind it. The board's own dock is a flat panel with a solid
 * fill and a 1px line, which next to the rest reads as a different surface.
 * These are the same values, written in the board's names. */
.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] {
  /* Beside the way out, at the left end of the bottom row. The board parks it
     on the right in its own JS and lets it be dragged along the wall; here the
     row has a fixed shape — out of the table, then the table's controls, then
     who is at it — so the placement is pinned and the drag goes with it. */
  left: 58px;
  bottom: 16px;
  transform: none;
  translate: none;
  border: 0;
  border-radius: calc(var(--app-radius) * 2);
  background: color-mix(in srgb, var(--app-card) 85%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--app-line) 60%, transparent),
    0 20px 25px -5px rgb(0 0 0 / 28%),
    0 8px 10px -6px rgb(0 0 0 / 24%);
  backdrop-filter: blur(12px);
}

.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='dockRow'] {
  padding: 4px;
  gap: 2px;
}

/* The items on it: the rail's rows, at the rail's size and radius. Quiet
   until the cursor is on them. */
.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='dockRow'] button:not([class*='btnPrimary']) {
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

.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='dockRow'] button:not([class*='btnPrimary']):hover {
  background: color-mix(in srgb, var(--app-secondary) 60%, transparent);
  color: var(--app-text);
}

.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='dockRow'] svg {
  width: 14px;
  height: 14px;
}

/* The grip went with the drag: a handle on something that cannot be picked
   up is an offer the row does not keep. */
.board-frame .${HOST}[data-mode='poker'] [class*='dockGrip'] {
  display: none;
}

/* The one filled thing on the row. Same height as everything beside it, so
   the row has one baseline the way the app's own does. */
.board-frame .${HOST}[data-mode='poker'] [class*='dockApp'] [class*='btnPrimary'] {
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
.board-frame .${HOST}[data-mode='poker'] svg[class*='wordmark'] {
  display: none;
}

.board-frame .${HOST}[data-mode='poker'] h1[class*='title'] {
  font-family: var(--app-display), Georgia, serif;
  font-size: 14.5px;
  font-weight: 400;
  letter-spacing: 0.01em;
}
`;

/** The flag the rail, the dock and Niko read to get out of the way. */
const STAGED = 'boardStaged';

/**
 * One board, staged in the window.
 *
 * `children` is the ceremony's own React app, already given its boot payload —
 * held back until the first snapshot is in hand, because a shell painted from
 * an empty store animates everything in the room a second time when the poll
 * lands.
 */
export function StagedBoard({
  boardId,
  mode,
  pidKey,
  onLeave,
  children,
}: {
  boardId: string;
  /** The ceremony, for the board's own `data-mode`. */
  mode: string;
  /** The board's own key for who you are, so the snapshot primed here is read
   *  as the same participant the board is about to be. */
  pidKey: string;
  onLeave: () => void;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    playBoard(boardId);
    // A board that will not answer is still a board: it gets to mount and show
    // its own reconnecting state rather than leaving the window empty.
    primeBoard(boardId, participantId(pidKey)).then(
      () => live && setReady(true),
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
  }, [boardId, pidKey]);

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
      // Two roots: the board in the window, and whatever it hangs off body.
      // The card being dragged is a portal, and with no tokens on it, it came
      // out with no ground, no rule and no text colour — invisible in the air.
      `@scope (.${HOST}, body > [class^='_']) {\n${rest.replaceAll(':root', ':scope')}\n}`,
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
        data-mode={mode}
        className={`${HOST} min-h-0 flex-1 transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {ready && children}
      </div>
      {/* The way out, where the app's own dock would be — a door and not a
          sentence: it opens the row the board's own controls continue. */}
      <button
        type="button"
        onClick={onLeave}
        className="fixed bottom-4 left-4 z-[60] flex h-[34px] w-[34px] items-center justify-center rounded-2xl bg-card/85 text-muted-foreground shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-colors hover:text-foreground"
      >
        <LogOut className="h-[14px] w-[14px]" />
      </button>
    </div>
  );
}
