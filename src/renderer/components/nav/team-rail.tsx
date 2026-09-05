'use client';

// The nav, as a floating rail rather than a column.
//
// It sits centred against the left edge and is icons until you approach it,
// at which point it widens and the labels arrive. Two things make that read as
// one object growing rather than a layout reflowing: the rail is fixed, so
// nothing under it moves, and only its own width animates — every row keeps
// its icon at the same x whether the labels are showing or not.
//
// Ops is not in here; see `railSections`.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useAudience } from '@/components/providers/audience-provider';
import { isSettingsPath, railRows } from '@/lib/nav/rail-rows';
import { cameFrom, isAsidePath, rememberRoute } from '@/lib/nav/came-from';
import { useActiveHref } from './use-nav-shortcuts';

/** Collapsed and expanded widths. The icon column is the same in both. */
const NARROW = 48;
const WIDE = 176;
/** Row height, as a number because the rows collapse to nothing in the notch. */
const ROW = 36;
/** The one surface that keeps the whole map: it is the one you go to in order
 *  to see where everything is. */
const HOME_HREF = '/home';
/** How long the cursor has to stay on the rail before the list opens. Long
 *  enough that passing over a row on the way to another one does not. */
const OPEN_DWELL_MS = 180;
/** The list changing hands, one row at a time: a row empties, fills with its
 *  replacement, and only then does the row below it start. Two waves — every
 *  row leaving, then every row arriving — reads as the list being cleared and
 *  another one written, which is not what is happening. */
const SWAP_STAGGER_MS = 42;
const OUT_MS = 120;
/** How long a row takes to grow into or out of the rail — the same transition
 *  the rows carry, and the beat the rail's own height needs before the slots a
 *  shorter list left empty can be taken away from under it. */
const ROW_MS = 220;

export function TeamRail({ cmdHeld }: { cmdHeld: boolean }) {
  const { audience } = useAudience();
  const router = useRouter();
  // A row opens the rail, never the rail itself; leaving it closes it. Rows and
  // labels arrive together — a list that widens a beat after it opens is two
  // movements where the cursor only asked for one.
  const [open, setOpen] = useState(false);
  const [labelled, setLabelled] = useState(false);
  // Labels only while the list is open. Held separately they could outlive it —
  // a dwell timer firing after something had already closed the rail left a
  // two-row notch wearing full-width labels, and every row in it was then a
  // click that landed on the page behind.
  //
  // Settings borrows the rail for its own sections, and takes it open: those
  // rows are named things rather than a map you already know, so hiding their
  // labels behind a hover would be worse than the strip of tabs they replace.
  const pathname = usePathname();
  // One place records where you were, because the rail and the dock both offer
  // the way back to it.
  rememberRoute(pathname);
  const aside = isAsidePath(pathname);
  const mode = isSettingsPath(pathname) ? 'settings' : aside ? 'aside' : audience;
  const settings = mode === 'settings';
  const wide = (open && labelled) || settings;

  // One list becoming another, a row at a time.
  //
  // `swapping` is the list on its way out; `revealed` is how far down the rail
  // the new one has got. A slot below that line still holds the old row, which
  // is what makes this a cascade of single rows changing rather than the whole
  // rail blinking.
  const back = cameFrom();
  const rows = useMemo(() => railRows(mode, back), [mode, back]);
  // The list on its way out, and the shape it was in: whether it was a notch,
  // and which of its rows was the one you were on. A leaving row has to look
  // exactly as it did — judged against where it came from, never against where
  // you have arrived.
  const [leaving, setLeaving] = useState<{
    rows: typeof rows;
    notch: boolean;
    active: string | undefined;
  } | null>(null);
  const [revealed, setRevealed] = useState(Number.POSITIVE_INFINITY);
  const lastMode = useRef<typeof mode>(mode);
  const was = useRef<{ notch: boolean; active: string | undefined }>({
    notch: false,
    active: undefined,
  });

  // Set while rendering, not after it. An effect runs once the frame is on
  // screen, so the first painted frame of a new list was the whole of it with
  // no swap in progress — a row three places down appeared, retreated as the
  // swap took hold, and came back when its turn arrived.
  if (lastMode.current !== mode) {
    const from = lastMode.current;
    lastMode.current = mode;
    setLeaving({ rows: railRows(from, back), ...was.current });
    setRevealed(0);
  }

  const slots = Math.max(rows.length, leaving?.rows.length ?? 0);
  const activeHref = useActiveHref(rows.map((item) => item.href));

  // On a panel the rail is a notch: Home and the row you are on. The rest are
  // still here at no height, so the list grows back out of it on hover rather
  // than appearing beside it. Settings and a page you stepped aside to are the
  // exceptions — their rows are the only nav those pages have.
  const notch = !settings && !aside && !open && Boolean(activeHref) && activeHref !== HOME_HREF;

  // A list where two rows are visible is not a list changing hands: it is one
  // row doing it. Cascading through nine slots to swap the second of them left
  // the rail a row short in the middle of it, because the row leaving collapsed
  // three beats before the row arriving grew.
  // A list where two rows are visible is not a list changing hands: it is one
  // row doing it. A notch shows two, and so does an aside pair — cascading
  // through nine slots to swap the second of them left the rail short in the
  // middle going one way, and briefly showing both the old row and the new one
  // going the other.
  const twoish = (list: typeof rows, shape: { notch: boolean; active: string | undefined }) =>
    list.length <= 2 ||
    (shape.notch &&
      list.filter((row) => row.href === HOME_HREF || row.href === shape.active).length <= 2);
  const oneStep =
    twoish(rows, { notch, active: activeHref }) && (!leaving || twoish(leaving.rows, leaving));
  was.current = { notch, active: activeHref };

  // Escape leaves. On settings and on a page you stepped aside to there is one
  // way out and the rail is offering it, so the key that means "not this" takes
  // it — but not out from under a dialog, a menu or something being typed into,
  // where Escape already means something nearer to hand.
  useEffect(() => {
    if (!settings && !aside) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.documentElement.dataset['overlay']) return;
      const on = document.activeElement as HTMLElement | null;
      if (on?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (on && (on.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(on.tagName)))
        return;
      router.push(back);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings, aside, back, router]);

  // The pages keep off the rail by its width, and on settings that width is
  // the open one. Declared on the root so every surface moves together with
  // it rather than each one knowing where the rail is.
  useEffect(() => {
    const root = document.documentElement;
    if (settings) root.dataset.railWide = '';
    else delete root.dataset.railWide;
  }, [settings]);

  useEffect(() => {
    if (!leaving) return;
    if (revealed >= slots) {
      // A shorter list leaves empty slots at the foot, and they collapse
      // rather than vanish — unmounting them the moment the last row landed
      // took the rail's height off in one step.
      const settle = setTimeout(() => {
        setLeaving(null);
        setRevealed(Number.POSITIVE_INFINITY);
      }, ROW_MS);
      return () => clearTimeout(settle);
    }
    // The first row waits out its own exit; every row after it waits for the
    // one above to have finished changing.
    const next = setTimeout(
      () => setRevealed((far) => (oneStep ? slots : far + 1)),
      revealed === 0 ? OUT_MS : SWAP_STAGGER_MS,
    );
    return () => clearTimeout(next);
  }, [revealed, slots, leaving, oneStep]);

  // A marker that slides to wherever you are, rather than a highlight that
  // simply appears there. Scrolling the deck moves through the rail, and the
  // travel is what makes that legible — you can see which way you went and how
  // far, which a lit row on its own never tells you.
  const listRef = useRef<HTMLDivElement>(null);
  const [markerTop, setMarkerTop] = useState<number | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Arriving leaves the cursor on the row that was clicked. The rail closes and
  // stays closed until the cursor moves — landing somewhere should not reopen
  // it, and a hover that never moved is not asking for anything.
  const sealed = useRef(false);
  const isOpen = useRef(false);
  isOpen.current = open;

  // Cancelling has to forget the timer as well as stop it: a handle left behind
  // reads as "already opening" forever, and the rail never opens again.
  const cancelOpen = () => {
    if (opening.current) clearTimeout(opening.current);
    opening.current = null;
  };
  const enter = () => {
    if (sealed.current || isOpen.current || opening.current) return;
    // A beat before it opens, and then it opens whole — rows and labels
    // together. The list grows from the rail's centre, so opening moves every
    // row: a cursor merely crossing one on its way to Home would otherwise
    // throw the list open and take Home out from under the click.
    opening.current = setTimeout(() => {
      opening.current = null;
      setOpen(true);
      setLabelled(true);
    }, OPEN_DWELL_MS);
  };
  const leave = () => {
    sealed.current = false;
    cancelOpen();
    setOpen(false);
    setLabelled(false);
  };

  // The row you press is the row you meant.
  //
  // A rail row is a link, and a link navigates on the button coming *up*. The
  // list is still settling under the cursor at that point — rows are growing
  // out of the notch, or collapsing back into it — so the release often landed
  // on a different row than the press, and a press and release on two elements
  // is not a click on either: the browser reports one on the nav, nothing
  // navigates, and the press reads as having only opened the menu. Taking the
  // route from the press settles it before anything can move.
  const pressed = useRef(false);
  const press = (href: string) => (event: React.PointerEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    cancelOpen();
    pressed.current = true;
    window.addEventListener('pointerup', () => (pressed.current = false), { once: true });
    router.push(href);
  };
  useEffect(
    () => () => {
      if (opening.current) clearTimeout(opening.current);
    },
    [],
  );

  // On a panel the rail is a notch: Home and the icon you are on. The
  // rows are still here, collapsed to no height, so the list grows back out of
  // the notch on hover rather than appearing beside it.
  // A panel is a notch until you reach for the rail. Home is the map — the one
  // surface you go to in order to see where everything is — so it shows the
  // whole list of icons. The labels still wait for a hover, everywhere.

  // The marker travels on a page turn and only then. Hovering changes the rows'
  // heights, and a marker that animates to catch up reads as a second thing
  // sliding about the rail — so there it is glued to its row frame by frame.
  const [travelling, setTravelling] = useState(false);
  const lastHref = useRef(activeHref);

  useLayoutEffect(() => {
    // Only where the row is, never how tall: the active row is always ROW high,
    // and a measurement taken while the others are collapsing catches it
    // mid-transition and leaves a sliver.
    // Mid-swap the active row has not been dealt yet, and a marker that
    // vanishes for it and comes back is a third thing moving. It holds where it
    // was until there is somewhere to be.
    const measure = () => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      if (row) setMarkerTop(row.offsetTop);
    };

    const navigated = lastHref.current !== activeHref;
    lastHref.current = activeHref;
    setTravelling(navigated);
    if (navigated) {
      setOpen(false);
      setLabelled(false);
      sealed.current = true;
      cancelOpen();
    }
    measure();

    let frame = 0;
    const until = performance.now() + 320;
    const follow = (now: number) => {
      measure();
      if (now < until) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [activeHref, open, wide, notch, revealed, slots]);

  return (
    <nav
      ref={navRef}
      data-rail
      aria-label={settings ? 'Settings sections' : aside ? 'Where to go back to' : 'Modes'}
      // Any movement on the rail is asking for it — including from inside its
      // own notch, which is the only way to open it once you have arrived here
      // through it. Except over Home, which is a destination and not a
      // handle: reaching for the way back should not cost you the list
      // opening under your hand. (On Home it is the only row there, so it has
      // to stay the way the rail opens.)
      onMouseMove={(event) => {
        sealed.current = false;
        if (activeHref !== HOME_HREF && (event.target as HTMLElement).closest('[data-home]')) {
          cancelOpen();
          return;
        }
        enter();
      }}
      onMouseLeave={leave}
      // Only the keyboard opens the rail by focus. A mouse focuses a row when
      // the button goes down, which opened the list under the cursor and moved
      // the row out from beneath it — the mouseup then landed somewhere else,
      // so the first click never completed and only ever opened the menu.
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).matches(':focus-visible')) return;
        setOpen(true);
        setLabelled(true);
      }}
      onBlurCapture={leave}
      // Centred, and it stays centred as it grows: opening it takes the rail
      // out both ways from the notch rather than dropping a list beneath it.
      className="fixed top-1/2 left-0 z-40 -translate-y-1/2 overflow-hidden rounded-r-2xl bg-card/85 p-1.5 shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-[width] duration-200 ease-out"
      style={{ width: wide ? WIDE : NARROW }}
    >
      <div ref={listRef} className="relative">
        {/* Nothing is lit where nothing is active. The marker holds its place
            through a swap so it does not blink on the way across, but a page
            you stepped aside to has no row of its own — and leaving the mark
            on Home said you were on Home. It fades rather than vanishing:
            taken away in a frame it reads as a glitch beside the row that is
            arriving. */}
        {markerTop !== null && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 left-0 rounded-xl bg-secondary"
            style={{
              top: markerTop,
              height: ROW,
              opacity: activeHref || leaving ? 1 : 0,
              transition: `${
                travelling ? 'top 300ms cubic-bezier(0.22, 1, 0.36, 1), ' : ''
              }opacity 200ms ease-out`,
            }}
          />
        )}
        {Array.from({ length: slots }, (_, slot) => {
          // The slot is the frame; the row is what is in it. Below the line the
          // new list has reached, that is still the old row — which is what
          // makes a swap a row changing rather than a rail blinking.
          const arrived = slot < revealed;
          // Not yet arrived means the old list still owns the slot — including
          // when the old list was shorter and owns nothing there. Falling back
          // to the new row would deal the tail of a longer list all at once.
          const row = arrived || !leaving ? rows[slot] : leaving.rows[slot];
          // Judged against the list the row belongs to. A mode list is a notch
          // and an aside list is not, so reading the destination's shape while
          // still showing the source's rows threw the whole menu open for the
          // length of the swap and then folded it away again.
          const shape = arrived || !leaving ? { notch, active: activeHref } : leaving;
          // A row that is in both lists is not changing hands. Home heads every
          // list the rail holds, and fading it out and back in said it had —
          // the point of the swap is that what stays put stays put.
          const staying = Boolean(leaving && leaving.rows[slot]?.href === rows[slot]?.href);
          const empty = !row;
          const active = Boolean(row) && shape.active === row!.href;
          // Home is always in the notch: the way back to the map should never
          // be a hover away.
          const kept = active || row?.href === HOME_HREF;
          const hidden = empty || (shape.notch && !kept);
          const Icon = row?.Icon;
          return (
            <div key={slot}>
              {/* A hairline instead of a heading: at 48px wide there is nowhere
                to put the word, and the group still needs to read as a group.
                It belongs to the row that opens the group, so it travels with
                it through a swap. */}
              <div
                aria-hidden
                className="mx-2 bg-border/50 transition-all duration-200 ease-out"
                style={{
                  height: row?.opensGroup && !shape.notch ? 1 : 0,
                  opacity: row?.opensGroup && !shape.notch ? 1 : 0,
                  marginTop: row?.opensGroup && !shape.notch ? 6 : 0,
                  marginBottom: row?.opensGroup && !shape.notch ? 6 : 0,
                }}
              />
              <Link
                href={row?.href ?? HOME_HREF}
                title={row?.label}
                data-active={active}
                data-home={row?.href === HOME_HREF || undefined}
                // Reaching for Home from somewhere else is a click, not a
                // request for the list — but on Home it is the only row
                // there, so it has to be the way the rail opens.
                onMouseEnter={
                  row?.href === HOME_HREF && activeHref !== HOME_HREF ? undefined : enter
                }
                onPointerDown={press(row?.href ?? HOME_HREF)}
                // The press has already navigated; the click that follows it
                // would only push the same route a second time. A keyboard
                // Enter never presses, so it still travels this way.
                onClick={(event) => {
                  if (!pressed.current) return;
                  event.preventDefault();
                }}
                aria-hidden={hidden}
                tabIndex={hidden ? -1 : undefined}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-[11px] text-xs font-body font-medium transition-all duration-200 ease-out ${
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
                style={{
                  height: hidden ? 0 : ROW,
                  opacity: hidden ? 0 : 1,
                  pointerEvents: hidden ? 'none' : undefined,
                  boxShadow: active && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
                }}
              >
                {/* Keyed on the row, so a slot changing hands mounts what
                  arrives and the animation has something to run on. The one
                  on its way out is the row still sitting above the line. */}
                {Icon && row && (
                  <span
                    key={row.href}
                    // Only while a swap is running. Left on afterwards, the
                    // class was there to be re-applied the moment the swap
                    // state cleared, and the row that had held still through
                    // the whole thing faded a beat after it ended.
                    className={`flex min-w-0 flex-1 items-center gap-3 ${
                      !leaving || staying ? '' : arrived ? 'rail-row-in' : 'rail-row-out'
                    }`}
                    style={{
                      animationDelay:
                        leaving && !staying && !arrived ? `${slot * SWAP_STAGGER_MS}ms` : undefined,
                    }}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" />
                    {/* Present in both states, so the icon never shifts: the
                      label is what fades and the rail is what widens. */}
                    <span
                      className="whitespace-nowrap transition-opacity duration-150"
                      style={{ opacity: wide ? 1 : 0 }}
                      aria-hidden={!wide}
                    >
                      {row.label}
                    </span>
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
