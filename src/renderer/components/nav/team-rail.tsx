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
/** How long a hover on a panel dwells before the labels arrive. Approaching
 *  the notch means "show me where I can go", which the icons answer; the words
 *  are for staying. */
const LABEL_DWELL_MS = 520;
/** How close to the top or bottom of the window the rail may be pushed while
 *  it holds a row still. */
const EDGE_GAP = 12;

export function TeamRail({ cmdHeld }: { cmdHeld: boolean }) {
  const { audience } = useAudience();
  // Two stages. `open` grows the rows back out of the notch, `wide` brings the
  // labels — on a panel the second waits, so a passing cursor does not throw
  // the whole nav across the page.
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const sections = railSections(audience);
  const items = sections.flatMap((section) => section.items);
  const activeHref = useActiveHref(items.map((item) => item.href));

  // A marker that slides to wherever you are, rather than a highlight that
  // simply appears there. Scrolling the deck moves through the rail, and the
  // travel is what makes that legible — you can see which way you went and how
  // far, which a lit row on its own never tells you.
  const listRef = useRef<HTMLDivElement>(null);
  const [markerTop, setMarkerTop] = useState<number | null>(null);

  // Where the active row sat on screen when the cursor arrived. The rail is
  // vertically centred, so growing it out of the notch would slide that row —
  // the one being pointed at — out from under the cursor. Pinning it holds the
  // row still and lets the list grow around it instead.
  const navRef = useRef<HTMLElement>(null);
  const pinned = useRef<number | null>(null);
  const [shift, setShift] = useState(0);
  const rowCentre = () => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    return row ? row.getBoundingClientRect().top + ROW / 2 : null;
  };

  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    pinned.current = rowCentre();
    setOpen(true);
    if (activeHref === HOME_HREF) {
      setWide(true);
      return;
    }
    dwell.current = setTimeout(() => setWide(true), LABEL_DWELL_MS);
  };
  const leave = () => {
    if (dwell.current) clearTimeout(dwell.current);
    // The pin stays for the collapse. Dropping it here would re-centre the rail
    // while the rows were still shrinking, and the row would bounce on its way
    // back. The layout it collapses to is the one it grew from, so the shift
    // converges to nothing by itself.
    setOpen(false);
    setWide(false);
  };
  useEffect(
    () => () => {
      if (dwell.current) clearTimeout(dwell.current);
    },
    [],
  );

  // On a panel the rail is a notch: Home and the icon you are on. The
  // rows are still here, collapsed to no height, so the list grows back out of
  // the notch on hover rather than appearing beside it.
  const notch = !open && Boolean(activeHref) && activeHref !== HOME_HREF;

  // The marker travels on a page turn and only then. Hovering changes the rows'
  // heights, and a marker that animates to catch up reads as a second thing
  // sliding about the rail — so there it is glued to its row frame by frame.
  const [travelling, setTravelling] = useState(false);
  const lastHref = useRef(activeHref);
  const shiftRef = useRef(0);
  shiftRef.current = shift;

  useLayoutEffect(() => {
    // Only where the row is, never how tall: the active row is always ROW high,
    // and a measurement taken while the others are collapsing catches it
    // mid-transition and leaves a sliver.
    const measure = () => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      setMarkerTop(row ? row.offsetTop : null);

      const nav = navRef.current;
      const centre = rowCentre();
      if (pinned.current === null || centre === null || !nav) return;
      // The rect already includes the shift, so this converges in a frame.
      // Clamped so holding the row still can never push the rail off screen.
      const room = Math.max(0, (window.innerHeight - nav.offsetHeight) / 2 - EDGE_GAP);
      const wanted = shiftRef.current + (pinned.current - centre);
      setShift(Math.max(-room, Math.min(room, wanted)));
    };

    const navigated = lastHref.current !== activeHref;
    lastHref.current = activeHref;
    setTravelling(navigated);
    if (navigated) {
      // A page turn is not a hover: there is no row to hold still.
      pinned.current = null;
      setShift(0);
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
  }, [activeHref, open, wide, audience, notch, shift]);

  return (
    <nav
      ref={navRef}
      aria-label="Modes"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocusCapture={() => {
        setOpen(true);
        setWide(true);
      }}
      onBlurCapture={leave}
      className="fixed left-0 top-1/2 z-40 overflow-hidden rounded-r-2xl bg-card/85 p-1.5 shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-[width] duration-200 ease-out"
      style={{
        width: wide ? WIDE : NARROW,
        transform: `translateY(calc(-50% + ${shift}px))`,
      }}
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
