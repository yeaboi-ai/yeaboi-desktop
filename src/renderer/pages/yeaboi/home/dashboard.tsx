'use client';

// Home, as the deck's first surface: where the work stands, not a menu of
// things to launch. The modes are one scroll away now, so this page's job is
// to answer "what happened, and what is next" before you go anywhere.
//
// Some of that the backend can answer today and some of it cannot. The tiles
// it cannot are drawn as themselves, labelled as waiting on their endpoint —
// a dashboard of invented numbers is worse than an honest gap, because you
// cannot tell by looking which half you are allowed to believe.

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { carriedTransform } from '@board/motion/useCarry';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  CalendarClock,
  Check,
  Columns3,
  Gauge,
  LayoutGrid,
  Plus,
  RotateCcw,
  Music,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';

import { Schedule, Upcoming, useSchedule } from '@/components/yeaboi/calendar';
import { Displaced } from '@/components/yeaboi/displaced';
import { Surface } from '@/components/yeaboi/surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MusicWidget } from './music-widget';
import { RetroActionsWidget } from './retro-actions-widget';
import {
  HOLD_TO_ARRANGE_MS,
  LEAVE_MS,
  useGridColumns,
  useGridFlip,
  useHoldToArrange,
  useWidgetMove,
  useWidgetResize,
} from './arrange';
import {
  MIN_SIZE,
  WIDGET_DEFAULTS,
  WIDGET_GAP,
  WIDGET_IDS,
  WIDGET_ROW,
  mergeWidgetPrefs,
  moveWidget,
  normalizeWidgetPrefs,
  resizeWidget,
  toggleWidget,
  visibleWidgets,
  widgetSize,
  type WidgetId,
  type WidgetPrefs,
  type WidgetSize,
} from '@shared/widgets';
import { apiGet, callTool } from '@/lib/yeaboi/api';

interface Board {
  id: string;
  title?: string;
  name?: string;
  mode?: string;
  created_at?: string;
}

/** What the Usage page totals, summarised on one tile. */
interface Usage {
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  note?: string;
}

interface ChangelogEntry {
  /** What the release did. The version on its own is a number, not news. */
  headline?: string;
  version?: string;
  date?: string;
}

/** A tile with no endpoint behind it yet. Said plainly rather than filled with
 *  a plausible number, so nothing here has to be second-guessed. */
/** The widgets this build knows how to draw — the second clamp the shared
 *  contract asks for. */
const KNOWN_WIDGETS = new Set<string>(WIDGET_IDS);

/** What each widget is called, for the dotted box that offers it back. */
const WIDGET_TITLES: Record<WidgetId, string> = {
  boards: 'Recent boards',
  shared: 'Shared out',
  'whats-new': "What's new",
  usage: 'Usage',
  'coming-up': 'Coming up',
  'retro-actions': 'Open actions',
  music: 'Music',
};

function AwaitingTile({ title, wants, tile }: { title: string; wants: string; tile: string }) {
  return (
    <div
      data-tile={tile}
      style={{ gridColumn: 'span 1', gridRow: `span ${MIN_SIZE.h}` }}
      className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-4"
    >
      <p className="font-body text-[12px] font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground/60">
        Waiting on <span className="font-code">{wants}</span>
      </p>
    </div>
  );
}

/** A tile, and where it opens.
 *
 *  A tile that summarises a page is the door to it: the nav used to carry a
 *  row for each of those pages as well, which is two ways in for one screen
 *  and a drawer of seven icons to hold them.
 *
 *  While the dashboard is being arranged it stops being a door — a press is a
 *  grab, and the whole surface is the handle. */
function Tile({
  id,
  title,
  icon: Icon,
  href,
  size,
  arranging,
  ripening,
  carried,
  leaving,
  flush,
  onPointerDown,
  onResize,
  onRemove,
  children,
}: {
  id?: WidgetId;
  title: string;
  icon: typeof LayoutGrid;
  href?: string;
  size: WidgetSize;
  arranging?: boolean;
  /** Under a press that is on its way to opening the arrange mode. */
  ripening?: boolean;
  /** In the air: the copy under the pointer is drawn instead of this. */
  carried?: boolean;
  /** On its way off the dashboard: it fades before its place closes up. */
  leaving?: boolean;
  /** The body is a picture rather than a list: no scroller, so what it draws
   *  can run out past the card's padding to its edges. */
  flush?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
  onResize?: (event: React.PointerEvent) => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const opens = Boolean(href) && !arranging;
  return (
    <div
      {...(id ? { 'data-widget-id': id, 'data-tile': id } : {})}
      role={opens ? 'link' : undefined}
      tabIndex={opens ? 0 : undefined}
      onPointerDown={onPointerDown}
      onClick={opens ? () => router.push(href!) : undefined}
      onKeyDown={
        opens
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                router.push(href!);
              }
            }
          : undefined
      }
      style={{
        gridColumn: `span ${size.w}`,
        gridRow: `span ${size.h}`,
        // The ramp is as long as the press it is describing, so the widget
        // arrives at its pressed state exactly as the mode opens. Written here
        // rather than as classes so the three channels are one statement.
        //
        // Inward, not outward: the surface is a scroller with four pixels of
        // padding, so a widget that grew under the press would be clipped at
        // the edge columns.
        ...(ripening
          ? {
              transitionDuration: `${HOLD_TO_ARRANGE_MS}ms`,
              boxShadow: '0 0 0 2px var(--muted-foreground)',
              backgroundColor: 'var(--secondary)',
              scale: '0.98',
            }
          : arranging
            ? {
                boxShadow:
                  '0 0 0 1px color-mix(in oklch, var(--muted-foreground) 55%, transparent)',
              }
            : {}),
        ...(leaving ? { transitionDuration: `${LEAVE_MS}ms` } : {}),
      }}
      className={cn(
        'group/tile relative flex min-h-0 flex-col rounded-2xl bg-card p-4 ring-1 ring-border/60',
        'transition-[box-shadow,background-color,scale,opacity] duration-200 ease-out',
        arranging && 'cursor-grab touch-none select-none',
        carried && 'opacity-0',
        leaving && 'pointer-events-none scale-[0.96] opacity-0',
        opens &&
          'cursor-pointer hover:bg-secondary/30 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      <p className="flex flex-none items-center gap-2 font-body text-[12px] font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </p>
      <div className={cn('mt-3 min-h-0 flex-1', !flush && 'quiet-scroll overflow-y-auto')}>
        {children}
      </div>

      {arranging && onRemove && (
        <button
          type="button"
          aria-label={`Remove ${title}`}
          onClick={onRemove}
          className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-secondary/90 text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
      {arranging && onResize && (
        // The corner is the handle. Bigger than it looks: the visible mark is
        // three pixels, the target it carries is a fingertip.
        <span
          role="separator"
          aria-label={`Resize ${title}`}
          onPointerDown={onResize}
          className="absolute right-0 bottom-0 size-6 cursor-nwse-resize touch-none"
        >
          <span className="absolute right-1.5 bottom-1.5 size-2 rounded-[2px] border-r-2 border-b-2 border-foreground/30" />
        </span>
      )}
    </div>
  );
}

/** Where the carried widget is going. The dotted box is the drop, and — at the
 *  end of the grid while arranging — the way to put one back. */
function DropSlot({ size }: { size: WidgetSize }) {
  return (
    <div
      data-drop-slot
      style={{ gridColumn: `span ${size.w}`, gridRow: `span ${size.h}` }}
      className="rounded-2xl border-2 border-dashed border-foreground/25 bg-foreground/[0.02]"
    />
  );
}

/** The dotted box that puts a widget back. Closed it is a plus; open it lists
 *  whatever is off the dashboard. */
function AddSlot({
  options,
  onAdd,
}: {
  options: { id: WidgetId; title: string }[];
  onAdd: (id: WidgetId) => void;
}) {
  const [open, setOpen] = useState(false);
  const none = options.length === 0;
  return (
    <div
      data-tile="add"
      style={{ gridColumn: 'span 1', gridRow: `span ${MIN_SIZE.h}` }}
      className="quiet-scroll flex min-h-0 flex-col overflow-y-auto rounded-2xl border-2 border-dashed border-foreground/20 p-2"
    >
      {open && !none ? (
        <ul className="flex flex-col gap-1">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(option.id);
                  setOpen(false);
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left font-body text-[12px] text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
              >
                {option.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          disabled={none}
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl font-body text-[12px] text-muted-foreground/70 transition-colors enabled:hover:bg-secondary/30 enabled:hover:text-foreground disabled:cursor-default"
        >
          {none ? (
            'Everything is on the dashboard'
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden />
              Add a widget
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-[11px] text-muted-foreground/70">{children}</p>;
}

export function HomeDashboard() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [shares, setShares] = useState<unknown[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const schedule = useSchedule();
  const { data: session } = useSession();
  // First name only, and nothing at all until the identity is loaded — the
  // fallback identity is called "You", and greeting someone by it is worse
  // than greeting them by nothing.
  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0];
  // A month grid takes the surface. The tiles leave as it opens and come back
  // with the week — mounted through their own exit, or there is nothing to
  // animate.
  const [monthView, setMonthView] = useState(false);
  const [widgets, setWidgets] = useState<WidgetPrefs>(WIDGET_DEFAULTS);
  const [arranging, setArranging] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columns = useGridColumns(gridRef);

  useEffect(() => {
    apiGet<{ boards?: Board[] }>('/api/boards').then(
      (data) => setBoards((data?.boards ?? []).slice(0, 5)),
      () => setBoards([]),
    );
    apiGet<{ shares?: unknown[] }>('/api/shares').then(
      (data) => setShares(data?.shares ?? []),
      () => setShares([]),
    );
    apiGet<{ entries?: ChangelogEntry[] }>('/api/meta/changelog').then(
      (data) => setChangelog((data?.entries ?? []).slice(0, 3)),
      () => setChangelog([]),
    );
    callTool<Usage>('usage_get').then(
      (envelope) => setUsage(envelope.ok ? (envelope.data ?? null) : null),
      () => setUsage(null),
    );
    window.yeaboi
      ?.getWidgetPrefs?.()
      .then((stored) => setWidgets(normalizeWidgetPrefs(stored)))
      .catch(() => undefined);
  }, []);

  // Drawn from what is stored and saved back at once: what you are looking at
  // while you arrange it is the thing being saved.
  const arrange = (patch: Partial<WidgetPrefs>) => {
    setWidgets((current) => mergeWidgetPrefs(current, patch));
    void window.yeaboi?.setWidgetPrefs?.(patch);
  };

  const [leaving, setLeaving] = useState<WidgetId | null>(null);
  const hold = useHoldToArrange(() => setArranging(true), !arranging);
  const move = useWidgetMove((id, index) => arrange(moveWidget(widgets, id, index)), arranging);
  const resize = useWidgetResize((id, size) => arrange(resizeWidget(widgets, id, size)), arranging);

  // Escape, Done, or a press outside the widgets: inside them every press is
  // one of the arranging gestures, so only the room around them can close it.
  useEffect(() => {
    if (!arranging) return;
    const busy = () => Boolean(move.carry || resize.carry);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy()) setArranging(false);
    };
    const away = (event: PointerEvent) => {
      const from = event.target;
      if (from instanceof Element && from.closest('[data-widget-grid]')) return;
      if (!busy()) setArranging(false);
    };
    window.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away, true);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', away, true);
    };
  }, [arranging, move.carry, resize.carry]);

  const shown = visibleWidgets(widgets, KNOWN_WIDGETS);
  const carriedId = move.carry ? (move.carry.itemId as WidgetId) : null;
  /** The pending size while a corner is being dragged, else the stored one. */
  const sizeOf = (id: WidgetId): WidgetSize =>
    resize.carry?.itemId === id && resize.carry.target
      ? resize.carry.target
      : widgetSize(widgets, id, columns);
  const flow = carriedId ? shown.filter((id) => id !== carriedId) : shown;
  const dropAt = carriedId ? (move.carry?.target ?? flow.length) : null;

  // It fades where it stands, and only then does its place close up — so the
  // slide that follows is the others moving in, not a scramble around it.
  const remove = (id: WidgetId) => {
    setLeaving(id);
    setTimeout(() => {
      setLeaving(null);
      arrange(toggleWidget(widgets, id, false));
    }, LEAVE_MS);
  };

  useGridFlip(
    gridRef,
    flow.map((id) => `${id}:${sizeOf(id).w}x${sizeOf(id).h}`).join(),
    Boolean(move.carry || resize.carry),
  );

  /** Every widget the dashboard can draw. Keyed by the shared contract's ids,
   *  so a widget that exists here and not there fails the type check. */
  const WIDGETS: Record<
    WidgetId,
    { title: string; icon: typeof Gauge; href?: string; flush?: boolean; body: React.ReactNode }
  > = {
    boards: {
      title: 'Recent boards',
      icon: Columns3,

      body: (
        <>
          {boards.length === 0 ? (
            <Empty>No boards run yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {boards.map((board) => (
                <li
                  key={board.id}
                  className="truncate px-2 font-body text-[12px] text-muted-foreground"
                >
                  {board.title ?? board.name ?? board.mode ?? board.id}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    shared: {
      title: 'Shared out',
      icon: Share2,

      body: (
        <>
          {shares.length === 0 ? (
            <Empty>Nothing shared yet.</Empty>
          ) : (
            <p className="font-body text-[26px] leading-none text-foreground">{shares.length}</p>
          )}
        </>
      ),
    },
    'whats-new': {
      title: "What's new",
      icon: Sparkles,
      href: '/whats-new',
      body: (
        <>
          {changelog.length === 0 ? (
            <Empty>Up to date.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {changelog.map((entry, index) => (
                <li key={entry.version ?? index}>
                  <p className="font-body text-[12px] leading-snug text-muted-foreground">
                    {entry.headline ?? entry.version}
                  </p>
                  {entry.headline && entry.date && (
                    <p className="mt-0.5 font-code text-[10px] text-muted-foreground/50">
                      {entry.date}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    usage: {
      title: 'Usage',
      icon: Gauge,

      body: (
        <>
          {usage ? (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {(
                  [
                    ['LLM calls', usage.call_count],
                    ['Total tokens', usage.total_tokens],
                    ['In', usage.input_tokens],
                    ['Out', usage.output_tokens],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-body text-[10px] tracking-wide text-muted-foreground uppercase">
                      {label}
                    </dt>
                    <dd className="font-code text-[13px] text-foreground">
                      {value.toLocaleString('en-US')}
                    </dd>
                  </div>
                ))}
              </dl>
              {usage.note && (
                <p className="mt-3 font-body text-[11px] leading-relaxed text-muted-foreground/70">
                  {usage.note}
                </p>
              )}
            </>
          ) : (
            <Empty>Nothing counted yet.</Empty>
          )}
        </>
      ),
    },
    'coming-up': {
      title: 'Coming up',
      icon: CalendarClock,

      body: (
        <>
          <Upcoming
            ceremonies={schedule.ceremonies}
            count={4}
            empty={
              schedule.error
                ? 'The schedule could not be read.'
                : 'Nothing scheduled — declare a ceremony and it appears here.'
            }
          />
        </>
      ),
    },
    'retro-actions': {
      title: 'Open actions',
      icon: RotateCcw,
      href: '/team/retro',
      body: (
        <>
          <RetroActionsWidget empty={Empty} />
        </>
      ),
    },
    music: {
      title: 'Music',
      icon: Music,
      href: '/music',
      flush: true,
      body: <MusicWidget />,
    },
  };

  return (
    <Surface>
      {/* Positioned, because what leaves is pinned against it. */}
      <div className="relative">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl text-foreground">
            Welcome{first && first !== 'You' ? `, ${first}` : ''}
          </h1>
          {arranging ? (
            <Button variant="ghost" size="sm" onClick={() => setArranging(false)}>
              <Check className="size-3.5" aria-hidden />
              Done
            </Button>
          ) : (
            <p className="font-body text-[11px] text-muted-foreground/50">
              Hold a widget to rearrange
            </p>
          )}
        </div>

        {/* What is coming, before what has happened: the calendar leads the
          surface rather than closing it. */}
        {/* The room under the calendar is the calendar's, not the tiles' —
            what gets pinned in place should carry no margin of its own. Above
            them, too: the deck's page-turn leaves a transform on every child
            of a surface, and a transform is a stacking context — so the
            calendar's own order counted for nothing against a sibling that
            came later in the tree. This is the box that has to carry it. */}
        <div className="relative z-10 mt-3 mb-6">
          <Schedule
            ceremonies={schedule.ceremonies}
            page={schedule.page}
            onExpand={setMonthView}
            onDeclared={schedule.refresh}
          />
        </div>

        <Displaced away={monthView}>
          <div
            ref={gridRef}
            data-widget-grid
            style={{ gridAutoRows: `${WIDGET_ROW}px`, gap: `${WIDGET_GAP}px` }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          >
            {flow.map((id, index) => {
              const widget = WIDGETS[id];
              const slot =
                dropAt === index && carriedId ? (
                  <DropSlot key="drop" size={sizeOf(carriedId)} />
                ) : null;
              return (
                <Fragment key={id}>
                  {slot}
                  <Tile
                    id={id}
                    title={widget.title}
                    icon={widget.icon}
                    size={sizeOf(id)}
                    arranging={arranging}
                    ripening={hold.holding === id}
                    {...(widget.href ? { href: widget.href } : {})}
                    onPointerDown={(event) =>
                      arranging
                        ? move.onBodyPointerDown(id, asPointer(event))
                        : hold.onPointerDown(id, asPointer(event))
                    }
                    onResize={(event) => {
                      // The corner is inside the widget, so without this the
                      // press starts a move as well as a resize.
                      event.stopPropagation();
                      resize.onHandlePointerDown(id, asPointer(event));
                    }}
                    leaving={leaving === id}
                    {...(widget.flush ? { flush: true } : {})}
                    onRemove={() => remove(id)}
                  >
                    {widget.body}
                  </Tile>
                </Fragment>
              );
            })}
            {dropAt === flow.length && carriedId && <DropSlot size={sizeOf(carriedId)} />}

            {arranging && (
              <AddSlot
                options={WIDGET_IDS.filter((id) => !shown.includes(id)).map((id) => ({
                  id,
                  title: WIDGET_TITLES[id],
                }))}
                onAdd={(id) => arrange(toggleWidget(widgets, id, true))}
              />
            )}

            <AwaitingTile tile="velocity" title="Velocity" wants="/api/analysis/velocity" />
            <AwaitingTile tile="sprint" title="Sprint progress" wants="/api/analysis/sprint" />
          </div>
        </Displaced>
      </div>

      {carriedId &&
        move.carry &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[70]">
            <div
              ref={move.previewRef as React.RefObject<HTMLDivElement>}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${move.carry.width}px`,
                height: `${rowsToPx(sizeOf(carriedId).h)}px`,
                transform: carriedTransform(move.carry),
                rotate: `${move.carry.tilt}deg`,
                transformOrigin: '50% 0%',
              }}
              className="flex flex-col rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-border transition-[rotate] duration-200 ease-out"
            >
              <p className="flex flex-none items-center gap-2 font-body text-[12px] font-medium text-foreground">
                {(() => {
                  const Icon = WIDGETS[carriedId].icon;
                  return <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />;
                })()}
                {WIDGETS[carriedId].title}
              </p>
              <div className="mt-3 min-h-0 flex-1 overflow-hidden">{WIDGETS[carriedId].body}</div>
            </div>
          </div>,
          document.body,
        )}
    </Surface>
  );
}

/** React's own event, which still knows what it was dispatched on — the native
 *  one has had its `currentTarget` cleared by the time a handler reads it. */
function asPointer(event: React.PointerEvent): PointerEvent {
  return event as unknown as PointerEvent;
}

/** The pixel height of a widget that many rows tall. */
function rowsToPx(rows: number): number {
  return rows * WIDGET_ROW + (rows - 1) * WIDGET_GAP;
}
