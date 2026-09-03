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
import { useLayoutEffect, useRef, useState } from 'react';
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

export function TeamRail({ cmdHeld }: { cmdHeld: boolean }) {
  const { audience } = useAudience();
  const [open, setOpen] = useState(false);
  const sections = railSections(audience);
  const items = sections.flatMap((section) => section.items);
  const activeHref = useActiveHref(items.map((item) => item.href));

  // A marker that slides to wherever you are, rather than a highlight that
  // simply appears there. Scrolling the deck moves through the rail, and the
  // travel is what makes that legible — you can see which way you went and how
  // far, which a lit row on its own never tells you.
  const listRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  // On a panel the rail is a notch: the icon you are on, and nothing else. The
  // rows are still here, collapsed to no height, so the list grows back out of
  // the notch on hover rather than appearing beside it.
  const notch = !open && Boolean(activeHref) && activeHref !== HOME_HREF;

  useLayoutEffect(() => {
    const measure = () => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      if (!row || !listRef.current) {
        setMarker(null);
        return;
      }
      setMarker({ top: row.offsetTop, height: row.offsetHeight });
    };
    measure();
    // Again once the rows have finished collapsing: the first pass reads the
    // layout they are leaving, not the one they are going to.
    const settled = setTimeout(measure, 260);
    return () => clearTimeout(settled);
  }, [activeHref, open, audience, notch]);

  return (
    <nav
      aria-label="Modes"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      className="fixed left-3 top-1/2 z-40 -translate-y-1/2 overflow-hidden rounded-2xl bg-card/85 p-1.5 shadow-xl ring-1 ring-border/60 backdrop-blur-md transition-[width] duration-200 ease-out"
      style={{ width: open ? WIDE : NARROW }}
    >
      <div ref={listRef} className="relative">
        {marker && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 rounded-xl bg-secondary transition-[top] duration-300 ease-out"
            style={{ top: marker.top, height: marker.height }}
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
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  data-active={active}
                  aria-hidden={notch && !active}
                  tabIndex={notch && !active ? -1 : undefined}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-[11px] text-xs font-body font-medium transition-all duration-200 ease-out ${
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }`}
                  style={{
                    height: notch && !active ? 0 : ROW,
                    opacity: notch && !active ? 0 : 1,
                    pointerEvents: notch && !active ? 'none' : undefined,
                    boxShadow: active && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
                  }}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0" />
                  {/* Present in both states, so the icon never shifts: the label
                    is what fades and the rail is what widens. */}
                  <span
                    className="whitespace-nowrap transition-opacity duration-150"
                    style={{ opacity: open ? 1 : 0 }}
                    aria-hidden={!open}
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
