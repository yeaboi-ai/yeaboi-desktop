'use client';

// Home, as the deck's first surface: where the work stands, not a menu of
// things to launch. The modes are one scroll away now, so this page's job is
// to answer "what happened, and what is next" before you go anywhere.
//
// Some of that the backend can answer today and some of it cannot. The tiles
// it cannot are drawn as themselves, labelled as waiting on their endpoint —
// a dashboard of invented numbers is worse than an honest gap, because you
// cannot tell by looking which half you are allowed to believe.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CalendarClock, Columns3, Gauge, LayoutGrid, Share2, Sparkles } from 'lucide-react';

import { Schedule, Upcoming, useSchedule } from '@/components/yeaboi/calendar';
import { Displaced } from '@/components/yeaboi/displaced';
import { Surface } from '@/components/yeaboi/surface';
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
function AwaitingTile({ title, wants }: { title: string; wants: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-4">
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
 *  and a drawer of seven icons to hold them. */
function Tile({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: typeof LayoutGrid;
  href?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const opens = Boolean(href);
  return (
    <div
      role={opens ? 'link' : undefined}
      tabIndex={opens ? 0 : undefined}
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
      className={`rounded-2xl bg-card p-4 ring-1 ring-border/60 ${
        opens
          ? 'cursor-pointer transition-colors hover:bg-secondary/30 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          : ''
      }`}
    >
      <p className="flex items-center gap-2 font-body text-[12px] font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </p>
      <div className="mt-3">{children}</div>
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
  }, []);

  return (
    <Surface>
      {/* Positioned, because what leaves is pinned against it. */}
      <div className="relative">
        <h1 className="font-display text-2xl text-foreground">
          Welcome{first && first !== 'You' ? `, ${first}` : ''}
        </h1>

        {/* What is coming, before what has happened: the calendar leads the
          surface rather than closing it. */}
        {/* The room under the calendar is the calendar's, not the tiles' —
            what gets pinned in place should carry no margin of its own. Above
            them, too: the deck's page-turn leaves a transform on every child
            of a surface, and a transform is a stacking context — so the
            calendar's own order counted for nothing against a sibling that
            came later in the tree. This is the box that has to carry it. */}
        <div className="relative z-10 mb-6 mt-3">
          <Schedule
            ceremonies={schedule.ceremonies}
            page={schedule.page}
            onExpand={setMonthView}
            onDeclared={schedule.refresh}
          />
        </div>

        <Displaced away={monthView}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Tile title="Recent boards" icon={Columns3}>
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
            </Tile>

            <Tile title="Shared out" icon={Share2}>
              {shares.length === 0 ? (
                <Empty>Nothing shared yet.</Empty>
              ) : (
                <p className="font-body text-[26px] leading-none text-foreground">
                  {shares.length}
                </p>
              )}
            </Tile>

            <Tile title="What's new" icon={Sparkles} href="/whats-new">
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
            </Tile>

            {/* All four figures, which is the whole of what the Usage page
                was. A screen to say four numbers is a screen you have to go to
                and come back from. */}
            <Tile title="Usage" icon={Gauge}>
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
            </Tile>

            <Tile title="Coming up" icon={CalendarClock}>
              <Upcoming
                ceremonies={schedule.ceremonies}
                count={4}
                empty={
                  schedule.error
                    ? 'The schedule could not be read.'
                    : 'Nothing scheduled — declare a ceremony and it appears here.'
                }
              />
            </Tile>

            <AwaitingTile title="Velocity" wants="/api/analysis/velocity" />
            <AwaitingTile title="Last retro" wants="/api/retro/recent" />
            <AwaitingTile title="Sprint progress" wants="/api/analysis/sprint" />
          </div>
        </Displaced>
      </div>
    </Surface>
  );
}
