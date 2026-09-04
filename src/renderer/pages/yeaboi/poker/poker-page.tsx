'use client';

// Planning poker, as one surface.
//
// Everything a session needs is here: the table when one is live, the questions
// that start one when none is, what is scheduled, and what has been played. The
// setup used to be a page you left for and came back from, which made starting
// a session a journey through three routes to reach a room the host is meant to
// be sitting in already.
//
// The table is served from the app for whoever is running it. Guests with the
// app can be handed the same board; everyone else joins the web board through
// the participant link, which is what `BoardHost` copies.

import { useCallback, useEffect, useState } from 'react';

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { Upcoming, useSchedule } from '@/components/yeaboi/calendar';
import { PokerSetup } from '@/components/yeaboi/poker-setup';
import { PokerBoard } from '@/components/yeaboi/poker-board';
import { canPlayBoards } from '@/board/board-api';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { Surface } from '@/components/yeaboi/surface';
import { type BoardSnapshot, type PokerRun, loadBoards, pokerHistory } from '@/lib/yeaboi/boards';

/** Which ceremonies belong on this surface. */
const MODES = ['poker'];

/** How many past sessions are listed before the rest are left to the export. */
const RECENT = 8;

interface PokerState {
  phase?: string;
  ticket_index?: number;
  ticket_count?: number;
  ticket?: { key?: string; summary?: string } | null;
  progress?: { estimated: number; total: number };
  presence?: { name: string }[];
}

function Panel({
  title,
  aside,
  children,
  /** Takes what height is left, and lets its contents scroll inside it. The
   *  surface never grows past the window, so a long list has to end
   *  somewhere — and it should be the list that moves, not the page. */
  grow = false,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl bg-card p-5 ring-1 ring-border/60 ${
        grow ? 'flex min-h-0 flex-1 flex-col' : ''
      }`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-body text-[13px] font-medium text-foreground">{title}</h2>
        {aside}
      </header>
      {grow ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : children}
    </section>
  );
}

/** The live table's own line: where the room is up to, in one row. */
function TableState({ board }: { board: BoardSnapshot }) {
  const state = (board.state ?? {}) as PokerState;
  const at = state.presence?.length ?? 0;
  const figures = [
    ['Ticket', `${(state.ticket_index ?? 0) + 1} / ${state.ticket_count ?? 0}`],
    ['Estimated', `${state.progress?.estimated ?? 0} / ${state.progress?.total ?? 0}`],
    ['At the table', String(at)],
    ['Phase', state.phase === 'voting' ? 'voting' : 'revealed'],
  ] as const;
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {figures.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-secondary/40 px-3 py-2">
          <p className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="font-code text-[12px] text-foreground">{value}</p>
        </div>
      ))}
      {state.ticket && (
        <p className="col-span-2 truncate font-body text-[12px] text-muted-foreground sm:col-span-4">
          <span className="font-code text-[11px] text-foreground">{state.ticket.key}</span>{' '}
          {state.ticket.summary}
        </p>
      )}
    </div>
  );
}

/** A past session as one line. Twenty of these used to be twenty cards; what
 *  anyone reads on the way past is the date, the scope and the two numbers. */
function PastRun({ run }: { run: PokerRun }) {
  return (
    <li className="group flex items-baseline gap-3 py-2">
      <span className="w-20 shrink-0 font-code text-[11px] text-muted-foreground">
        {run.poker_date}
      </span>
      <span className="min-w-0 flex-1 truncate font-body text-[12px] text-foreground">
        {run.scope_label || 'Session'}
      </span>
      <span className="shrink-0 font-code text-[11px] text-muted-foreground/70">
        {run.estimated_count ?? 0}/{run.ticket_count ?? 0}
      </span>
      {/* The export lives on the row it belongs to, and stays out of the way
          until the row is under the cursor. */}
      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <ResultActions
          refer={{ kind: 'poker', session_id: run.session_id, run_id: run.id }}
          mode="poker"
        />
      </span>
    </li>
  );
}

function PokerBody() {
  const { ceremonies } = useSchedule();
  const [runs, setRuns] = useState<PokerRun[] | null>(null);
  const [error, setError] = useState('');
  const [liveId, setLiveId] = useState('');
  const [board] = useBoard(liveId);
  const [all, setAll] = useState(false);
  // Playing the board in the window: the table takes the surface and the app's
  // chrome steps back off its edges until it is left.
  const [staged, setStaged] = useState(false);

  const history = useCallback(() => {
    pokerHistory().then(
      (envelope) => setRuns(envelope.data?.history ?? []),
      (e: Error) => setError(e.message),
    );
  }, []);

  useEffect(() => {
    history();
    loadBoards().then(
      (body) => setLiveId(body.boards.find((one) => one.kind === 'poker')?.board_id ?? ''),
      () => undefined,
    );
  }, [history]);

  const playing = staged && Boolean(board);
  const mine = ceremonies.filter((ceremony) => MODES.includes(ceremony.mode));
  const listed = all ? (runs ?? []) : (runs ?? []).slice(0, RECENT);

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="font-display text-2xl text-foreground">Planning poker</h1>
        <p className="mt-1 font-body text-[13px] text-muted-foreground">
          The team estimates from their own browsers; the points go back to the board.
        </p>
      </header>

      {playing && board && (
        <PokerBoard boardId={board.board_id} scope={board.title} onLeave={() => setStaged(false)} />
      )}

      {!playing && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          {board ? (
            <Panel
              title="At the table"
              aside={
                <a
                  href={`#/team/poker/board?id=${encodeURIComponent(board.board_id)}`}
                  className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Full view
                </a>
              }
            >
              <TableState board={board} />
              <BoardHost
                board={board}
                onStage={canPlayBoards() ? () => setStaged(true) : undefined}
                onClosed={() => {
                  setLiveId('');
                  setStaged(false);
                  history();
                }}
              />
            </Panel>
          ) : (
            <Panel title="New session">
              {/* Dealing does not go anywhere: the panel this replaces is the
                table, on the surface the host is already looking at. */}
              <PokerSetup onOpened={setLiveId} />
            </Panel>
          )}

          <Panel
            title="Scheduled"
            aside={
              <a
                href="#/ceremonies"
                className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                All ceremonies
              </a>
            }
          >
            <Upcoming
              ceremonies={mine}
              count={4}
              empty="No poker on the calendar — declare one in Ceremonies and it will show up here."
            />
          </Panel>
        </div>
      )}

      {!playing && (
        <Panel
          grow
          title="Past sessions"
          aside={
            runs && runs.length > RECENT ? (
              <button
                type="button"
                onClick={() => setAll(!all)}
                className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {all ? 'Show recent' : `All ${runs.length}`}
              </button>
            ) : undefined
          }
        >
          {!runs && <p className="font-body text-[12px] text-muted-foreground">Loading…</p>}
          {runs && runs.length === 0 && (
            <p className="font-body text-[12px] text-muted-foreground">
              {error ||
                'Nothing played yet. Pick a sprint above, send the invite, and everyone votes at once — no anchoring on whoever spoke first.'}
            </p>
          )}
          {listed.length > 0 && (
            <ul className="divide-y divide-border/40">
              {listed.map((run) => (
                <PastRun key={run.id} run={run} />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

export default function PokerPage() {
  return (
    <BackendGate>
      <Surface>
        <PokerBody />
      </Surface>
    </BackendGate>
  );
}
