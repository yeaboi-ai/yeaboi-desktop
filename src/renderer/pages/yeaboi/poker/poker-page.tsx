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
import { Schedule, useSchedule } from '@/components/yeaboi/calendar';
import { PokerSetup } from '@/components/yeaboi/poker-setup';
import { PokerBoard } from '@/components/yeaboi/poker-board';
import { canPlayBoards } from '@/board/board-api';
import { Panel, Surface } from '@/components/yeaboi/surface';
import { type BoardSnapshot, loadBoards } from '@/lib/yeaboi/boards';

/** Which ceremonies belong on this surface. */
const MODES = ['poker'];

/** The panel's own exit, before it comes off the page. */
const PEEL_MS = 380;

interface PokerState {
  phase?: string;
  ticket_index?: number;
  ticket_count?: number;
  ticket?: { key?: string; summary?: string } | null;
  progress?: { estimated: number; total: number };
  presence?: { name: string }[];
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

function PokerBody() {
  const { ceremonies } = useSchedule();
  const [liveId, setLiveId] = useState('');
  const [board] = useBoard(liveId);
  // Playing the board in the window: the table takes the surface and the app's
  // chrome steps back off its edges until it is left.
  const [staged, setStaged] = useState(false);
  // A month grid takes the surface; the panel comes back with the week.
  const [monthView, setMonthView] = useState(false);
  const [panelGone, setPanelGone] = useState(false);

  useEffect(() => {
    if (!monthView) {
      setPanelGone(false);
      return;
    }
    const gone = window.setTimeout(() => setPanelGone(true), PEEL_MS);
    return () => window.clearTimeout(gone);
  }, [monthView]);

  useEffect(() => {
    loadBoards().then(
      (body) => setLiveId(body.boards.find((one) => one.kind === 'poker')?.board_id ?? ''),
      () => undefined,
    );
  }, []);

  const playing = staged && Boolean(board);
  const mine = ceremonies.filter((ceremony) => MODES.includes(ceremony.mode));

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

        {/* When the poker is, before what it is: the calendar leads the
            surface, and only poker is on it. */}
        <Schedule ceremonies={mine} onExpand={setMonthView} />

        {/* The panel leaves as the month opens, and is off the page by the
            time it has. */}
        <div className={`${monthView ? 'peel-out' : 'peel-in'} ${panelGone ? 'hidden' : ''}`}>
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
                }}
              />
            </Panel>
          ) : (
            /* Dealing does not go anywhere: the panel this replaces is the
               table, on the surface the host is already looking at. The setup
               draws its own panel, because what it asks belongs inside one and
               what it does next does not. */
            <PokerSetup onOpened={setLiveId} />
          )}
        </div>
      </div>
    </Surface>
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
