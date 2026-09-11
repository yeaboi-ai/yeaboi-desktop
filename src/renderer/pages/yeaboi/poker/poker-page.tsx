'use client';

// Planning poker, as one surface.
//
// Everything a session needs is here: what poker is scheduled, and either the
// table when one is live or the questions that start one when none is. The
// setup used to be a page you left for and came back from, which made starting
// a session a journey through three routes to reach a room the host is meant to
// be sitting in already.
//
// The table is served from the app for whoever is running it. Guests with the
// app can be handed the same board; everyone else joins the web board through
// the participant link, which is what `BoardHost` copies.

import { useEffect, useState } from 'react';

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { PokerSetup } from '@/components/yeaboi/poker-setup';
import { PokerBoard } from '@/components/yeaboi/poker-board';
import { canPlayBoards } from '@/board/board-api';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { ScrollBox } from '@/components/yeaboi/scroll-box';
import { Surface } from '@/components/yeaboi/surface';
import {
  type BoardSnapshot,
  type PokerReportSummary,
  type PokerRun,
  type PokerTicketResult,
  loadBoards,
  pokerHistory,
} from '@/lib/yeaboi/boards';

interface PokerState {
  phase?: string;
  ticket_index?: number;
  ticket_count?: number;
  ticket?: { key?: string; summary?: string } | null;
  progress?: { estimated: number; total: number };
  presence?: { name: string }[];
}

/** How many rows tall the ledger stands, whatever it holds. */
const LEDGER_ROWS = 5;
/** One ledger row, in px. */
const LEDGER_ROW = 49;
/** How far back it reaches. */
const LEDGER_LIMIT = 30;
/** How many rows tall the ticket list stands. Taller than the ledger: it is
 *  the column's subject, not its footer. */
const TICKETS_ROWS = 7;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where the room is up to, in four figures. */
function figuresFor(board: BoardSnapshot) {
  const state = (board.state ?? {}) as PokerState;
  return [
    ['Ticket', `${(state.ticket_index ?? 0) + 1} / ${state.ticket_count ?? 0}`],
    ['Estimated', `${state.progress?.estimated ?? 0} / ${state.progress?.total ?? 0}`],
    ['At the table', String(state.presence?.length ?? 0)],
    ['Phase', state.phase === 'voting' ? 'voting' : 'revealed'],
  ] as const;
}

function TableState({
  figures,
  ticket,
}: {
  figures: readonly (readonly [string, string])[];
  ticket?: { key?: string; summary?: string } | null;
}) {
  return (
    <div className="mb-3 grid flex-1 grid-cols-2 grid-rows-2 gap-2">
      {figures.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-secondary/40 px-3 py-2">
          <p className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="font-code text-[12px] text-foreground">{value}</p>
        </div>
      ))}
      {ticket && (
        <p className="col-span-2 truncate font-body text-[12px] text-muted-foreground">
          <span className="font-code text-[11px] text-foreground">{ticket.key}</span>{' '}
          {ticket.summary}
        </p>
      )}
    </div>
  );
}

function PokerBody() {
  const [liveId, setLiveId] = useState('');
  const [board] = useBoard(liveId);
  // Playing the board in the window: the table takes the surface and the app's
  // chrome steps back off its edges until it is left.
  const [staged, setStaged] = useState(false);
  const [runs, setRuns] = useState<PokerRun[] | null>(null);
  const [report, setReport] = useState<PokerReportSummary | null>(null);

  const readHistory = () =>
    pokerHistory(LEDGER_LIMIT).then(
      (envelope) => {
        setRuns(envelope.data?.history ?? []);
        setReport(envelope.data?.latest_report ?? null);
      },
      () => setRuns([]),
    );

  useEffect(() => {
    loadBoards().then(
      (body) => setLiveId(body.boards.find((one) => one.kind === 'poker')?.board_id ?? ''),
      () => undefined,
    );
    void readHistory();
    // Once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playing = staged && Boolean(board);

  // The table is the window, not a panel on it. Rendered outside the surface —
  // no page padding, no centred column, no title above it — because a board
  // inside the box the rest of the page is drawn in is a screen within a
  // screen, and this app is the one running the room.
  if (playing && board) {
    return (
      <PokerBoard boardId={board.board_id} scope={board.title} onLeave={() => setStaged(false)} />
    );
  }

  return (
    <Surface>
      <div className="flex h-full flex-col gap-4">
        <header>
          <h1 className="font-display text-2xl text-foreground">Planning poker</h1>
          <p className="mt-1 font-body text-[13px] text-muted-foreground">
            The team estimates from their own browsers; the points go back to the board.
          </p>
        </header>

        <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <TicketSummary tickets={report?.tickets ?? []} date={report?.date ?? ''} />
          {/* The table while one is up; otherwise the way to the next one.
              There is no third thing to say here — what the last session came
              to is the column beside this, in full rather than as four
              figures counting it. */}
          <div className="flex min-h-0 flex-col">
            {board ? (
              <TablePanel
                board={board}
                onStage={canPlayBoards() ? () => setStaged(true) : undefined}
                onClosed={() => {
                  setLiveId('');
                  setStaged(false);
                  void readHistory();
                }}
              />
            ) : (
              <PokerSetup onOpened={setLiveId} />
            )}
          </div>
        </div>

        {/* At the foot of the screen, the same ledger the retro keeps. */}
        {runs && runs.length > 0 && (
          <div className="mt-auto">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[15px] leading-none text-muted-foreground">
                Recent sessions
              </h2>
              <span className="font-code text-[11px] text-muted-foreground tabular-nums">
                {runs.length}
              </span>
            </div>
            <ScrollBox height={LEDGER_ROWS * LEDGER_ROW} className="divide-y divide-border/40">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  <p className="min-w-0 flex-1 truncate font-body text-[13px] text-foreground">
                    {run.scope_label || run.poker_date}
                    {run.scope_label && (
                      <span className="ml-2 font-code text-[11px] text-muted-foreground/70">
                        {run.poker_date}
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 font-code text-[11px] text-muted-foreground tabular-nums">
                    {plural(run.ticket_count ?? 0, 'ticket')} · {run.estimated_count ?? 0} estimated
                  </p>
                  <ResultActions
                    refer={{ kind: 'poker', session_id: run.session_id, run_id: run.id }}
                    mode="poker"
                  />
                </div>
              ))}
            </ScrollBox>
          </div>
        )}
      </div>
    </Surface>
  );
}

/** What the last session settled, ticket by ticket. The figures beside it say
 *  how many; this says which, and for how much. */
function TicketSummary({ tickets, date }: { tickets: PokerTicketResult[]; date: string }) {
  return (
    <section className="flex min-h-0 flex-col py-5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-[19px] leading-none text-foreground">Previous session</h2>
        {date && <span className="font-code text-[11px] text-muted-foreground">{date}</span>}
        {tickets.length > 0 && (
          <span className="font-code text-[11px] text-muted-foreground tabular-nums">
            {plural(tickets.length, 'ticket')}
          </span>
        )}
      </div>
      {tickets.length === 0 ? (
        <p className="mt-3 font-body text-[13px] leading-relaxed text-muted-foreground">
          Nothing estimated yet — the last session's tickets land here.
        </p>
      ) : (
        <div className="mt-4 min-h-0 flex-1">
          <ScrollBox height={TICKETS_ROWS * LEDGER_ROW} className="divide-y divide-border/40">
            {tickets.map((ticket) => (
              <div key={ticket.key} className="flex items-center gap-3 py-2.5">
                <span className="shrink-0 font-code text-[11px] text-muted-foreground">
                  {ticket.key}
                </span>
                <p className="min-w-0 flex-1 truncate font-body text-[13px] text-foreground">
                  {ticket.summary}
                </p>
                {/* The number the room agreed, or why there isn't one. */}
                <span
                  className={`shrink-0 font-code text-[12px] tabular-nums ${
                    ticket.estimated ? 'text-foreground' : 'text-muted-foreground/60'
                  }`}
                >
                  {ticket.estimated ? (ticket.final_points ?? '—') : 'not voted'}
                </span>
              </div>
            ))}
          </ScrollBox>
        </div>
      )}
    </section>
  );
}

/** Where the room is up to, and what can be done with it. */
function TablePanel({
  board,
  onStage,
  onClosed,
}: {
  board: BoardSnapshot;
  onStage?: (() => void) | undefined;
  onClosed: () => void;
}) {
  const state = (board.state ?? {}) as PokerState;
  return (
    <section className="flex flex-1 flex-col py-5">
      <h2 className="font-display text-[19px] leading-none text-foreground">At the table</h2>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <TableState figures={figuresFor(board)} ticket={state.ticket} />
      </div>

      <div className="pt-1">
        <BoardHost
          fill
          board={board}
          onStage={onStage}
          onClosed={onClosed}
          extras={
            <ResultActions
              fill
              refer={{ kind: 'poker', session_id: board.session_id }}
              mode="poker"
            />
          }
        />
      </div>
    </section>
  );
}

export default function PokerPage() {
  // The surface is the body's to draw, not this page's: with a table up there
  // is no surface, only the board.
  return (
    <BackendGate>
      <PokerBody />
    </BackendGate>
  );
}
