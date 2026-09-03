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
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  CalendarClock,
  Columns3,
  Gauge,
  Home,
  LayoutGrid,
  Map,
  Megaphone,
  Presentation,
  RotateCcw,
  Rocket,
  ShieldCheck,
  Spade,
  Sunrise,
  TrendingUp,
} from 'lucide-react';

import { useAudience } from '@/components/providers/audience-provider';
import { railSections, type IconKey } from '@/lib/nav/sections';
import { useActiveHref } from './use-nav-shortcuts';

const ICONS: Partial<Record<IconKey, typeof Home>> = {
  home: Home,
  projects: LayoutGrid,
  board: Columns3,
  roadmap: Map,
  analysis: BarChart3,
  standup: Sunrise,
  retro: RotateCcw,
  poker: Spade,
  performance: TrendingUp,
  reporting: Presentation,
  ship: Rocket,
  review: CalendarClock,
  'agent-usage': Gauge,
  'agent-advisor': Megaphone,
  'agent-standup': Sunrise,
  'agent-security': ShieldCheck,
};

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
  const wide = open && labelled;
  const sections = railSections(audience);
  const items = sections.flatMap((section) => section.items);
  const activeHref = useActiveHref(items.map((item) => item.href));

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
  const notch = !open && Boolean(activeHref) && activeHref !== HOME_HREF;

  // The marker travels on a page turn and only then. Hovering changes the rows'
  // heights, and a marker that animates to catch up reads as a second thing
  // sliding about the rail — so there it is glued to its row frame by frame.
  const [travelling, setTravelling] = useState(false);
  const lastHref = useRef(activeHref);

  useLayoutEffect(() => {
    // Only where the row is, never how tall: the active row is always ROW high,
    // and a measurement taken while the others are collapsing catches it
    // mid-transition and leaves a sliver.
    const measure = () => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      setMarkerTop(row ? row.offsetTop : null);
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
  }, [activeHref, open, wide, audience, notch]);

  return (
    <nav
      ref={navRef}
      aria-label="Modes"
      // Any movement on the rail is asking for it — including from inside its
      // own notch, which is the only way to open it once you have arrived here
      // through it.
      onMouseMove={() => {
        sealed.current = false;
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
      className="fixed left-0 top-1/2 z-40 -translate-y-1/2 overflow-hidden rounded-r-2xl bg-card/85 p-1.5 shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-[width] duration-200 ease-out"
      style={{ width: wide ? WIDE : NARROW }}
    >
      <div ref={listRef} className="relative">
        {markerTop !== null && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 rounded-xl bg-secondary"
            style={{
              top: markerTop,
              height: ROW,
              transition: travelling ? 'top 300ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          />
        )}
        {sections.map((section, index) => (
          <div key={section.label ?? `top-${index}`}>
            {/* A hairline instead of a heading: at 48px wide there is nowhere to
              put the word, and the group still needs to read as a group. */}
            {index > 0 && (
              <div
                className="mx-2 bg-border/50 transition-all duration-200 ease-out"
                style={{
                  height: notch ? 0 : 1,
                  opacity: notch ? 0 : 1,
                  marginTop: notch ? 0 : 6,
                  marginBottom: notch ? 0 : 6,
                }}
              />
            )}
            {section.items.map(({ href, label, icon }) => {
              const Icon = ICONS[icon] ?? Bot;
              const active = activeHref === href;
              // Home is always in the notch: the way back to the map should
              // never be a hover away.
              const kept = active || href === HOME_HREF;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  data-active={active}
                  // Reaching for Home from somewhere else is a click, not a
                  // request for the list — but on Home it is the only row
                  // there, so it has to be the way the rail opens.
                  onMouseEnter={href === HOME_HREF && activeHref !== HOME_HREF ? undefined : enter}
                  onPointerDown={press(href)}
                  // The press has already navigated; the click that follows it
                  // would only push the same route a second time. A keyboard
                  // Enter never presses, so it still travels this way.
                  onClick={(event) => {
                    if (!pressed.current) return;
                    event.preventDefault();
                  }}
                  aria-hidden={notch && !kept}
                  tabIndex={notch && !kept ? -1 : undefined}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-[11px] text-xs font-body font-medium transition-all duration-200 ease-out ${
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }`}
                  style={{
                    height: notch && !kept ? 0 : ROW,
                    opacity: notch && !kept ? 0 : 1,
                    pointerEvents: notch && !kept ? 'none' : undefined,
                    boxShadow: active && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
                  }}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0" />
                  {/* Present in both states, so the icon never shifts: the label
                    is what fades and the rail is what widens. */}
                  <span
                    className="whitespace-nowrap transition-opacity duration-150"
                    style={{ opacity: wide ? 1 : 0 }}
                    aria-hidden={!wide}
                  >
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
