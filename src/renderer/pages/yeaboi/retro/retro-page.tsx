'use client';

// Retro, as one surface.
//
// Everything a retro needs is here: the board when one is live, what to do
// with it, and every retro before it. Starting one used to send the host to a
// page of its own and the board to a window of its own — three places for one
// ceremony, none of which was the board.
//
// The board is served from the app for whoever is running it. Guests with the
// app can be handed the same board; everyone else joins the web board through
// the participant link, which is what `BoardHost` hands out.

import { useEffect, useState } from 'react';

import { DuckMark } from '@/components/brand/duck';
import { quip } from '@/lib/yeaboi/ambience';
import {
  type BoardSnapshot,
  type RetroBoardState,
  type RetroRun,
  generateActionItems,
  loadBoards,
  retroHistory,
  startRetroBoard,
} from '@/lib/yeaboi/boards';
import { canPlayBoards } from '@/board/board-api';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { RetroBoard } from '@/components/yeaboi/retro-board';
import { Panel, Surface } from '@/components/yeaboi/surface';
import { Button } from '@/components/ui/button';

const GRID_TITLES: Record<string, string> = {
  went_well: 'Went well',
  didnt_go_well: "Didn't go well",
  action_items: 'Action items',
  demos: 'Demos',
};

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-destructive/30">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="mt-1 text-[12px] text-muted-foreground">
          {item}
        </p>
      ))}
    </div>
  );
}

/** The live board's own line: how full each column is, in one row. The cards
 *  themselves are on the board — this says whether there are any yet. */
function BoardState({ board }: { board: BoardSnapshot }) {
  const state = (board.state ?? {}) as unknown as RetroBoardState;
  const grids = state.grids ?? {};
  const columns = Object.keys(GRID_TITLES).filter((key) => key in grids);
  const shown = columns.length > 0 ? columns : Object.keys(grids);
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {shown.map((key) => (
        <div key={key} className="rounded-xl bg-secondary/40 px-3 py-2">
          <p className="font-body text-[10px] tracking-wide text-muted-foreground uppercase">
            {GRID_TITLES[key] ?? key}
          </p>
          <p className="font-code text-[12px] text-foreground">
            {grids[key]?.length ?? 0} {grids[key]?.length === 1 ? 'card' : 'cards'}
          </p>
        </div>
      ))}
    </div>
  );
}

function RetroBody() {
  const [runs, setRuns] = useState<RetroRun[] | null>(null);
  // The session the history belongs to is a sibling of the rows, not a column
  // on them — an artifact reference needs both halves.
  const [sessionId, setSessionId] = useState('');
  const [liveId, setLiveId] = useState('');
  const [board] = useBoard(liveId);
  // Playing the board in the window: it takes the surface and the app's chrome
  // steps back off its edges until it is left.
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');

  useEffect(() => {
    retroHistory().then(
      (envelope) => {
        setRuns(envelope.data?.history ?? []);
        setSessionId(envelope.data?.session_id ?? '');
      },
      (e: Error) => setError(e.message),
    );
    loadBoards().then(
      (body) => setLiveId(body.boards.find((one) => one.kind === 'retro')?.board_id ?? ''),
      () => undefined,
    );
  }, []);

  async function start() {
    setBusy('start');
    setError('');
    try {
      const started = await startRetroBoard();
      setLiveId(started.board_id);
      // Starting a board is asking to be on it. The host who opened it is the
      // one person who should not have to find the way in.
      if (canPlayBoards()) setStaged(true);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function draft() {
    if (!board) return;
    setBusy('draft');
    try {
      const result = await generateActionItems(board.board_id);
      setMessage(result.message);
      quip('actions_done');
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy('');
  }

  // The board is the window, not a panel on it. Rendered outside the surface —
  // no page padding, no centred column, no title above it — because a board
  // inside the box the rest of the page is drawn in is a screen within a
  // screen, and this app is the one running the room.
  if (staged && board) {
    return (
      <RetroBoard boardId={board.board_id} sprint={board.title} onLeave={() => setStaged(false)} />
    );
  }

  return (
    <Surface>
      <div className="flex h-full flex-col gap-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-foreground">Retro</h1>
            <p className="mt-1 font-body text-[13px] text-muted-foreground">
              A live board your team fills in from their own browsers, and every retro before it.
            </p>
          </div>
          {!board && (
            <Button size="sm" disabled={busy === 'start'} onClick={() => void start()}>
              {busy === 'start' ? 'Opening…' : 'Start a retro'}
            </Button>
          )}
        </header>

        {error && <Notice title="Could not start the board" items={[error]} />}

        {board && (
          <Panel
            title="On the board"
            aside={
              <a
                href={`#/team/retro/board?id=${encodeURIComponent(board.board_id)}`}
                className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Full view
              </a>
            }
          >
            <BoardState board={board} />
            {/* One row. Drafting the actions is the host's, and the only
                thing on this page the board itself does not offer; the export
                and share are the same set of choices about the same session,
                so they stand beside it rather than under it. */}
            <BoardHost
              board={board}
              onStage={canPlayBoards() ? () => setStaged(true) : undefined}
              onClosed={() => {
                setLiveId('');
                setStaged(false);
                retroHistory().then(
                  (envelope) => setRuns(envelope.data?.history ?? []),
                  () => undefined,
                );
              }}
              extras={
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === 'draft'}
                    onClick={() => void draft()}
                  >
                    {busy === 'draft' ? 'Drafting…' : 'Generate action items'}
                  </Button>
                  <ResultActions
                    refer={{ kind: 'retro', session_id: board.session_id }}
                    mode="retro"
                    anonNote={anonNote}
                    onAnonymize={(replacements, note) => {
                      setMask(replacements);
                      setAnonNote(note);
                    }}
                  />
                </>
              }
            />
            {message && <p className="mt-2 text-[12px] text-muted-foreground">{message}</p>}
            {mask.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground/70">
                {mask.length} name{mask.length === 1 ? '' : 's'} replaced in what leaves here.
              </p>
            )}
          </Panel>
        )}

        {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

        {/* A ledger, not a wall of tiles. Every past retro carried the same
            date twice, two figures set at twenty pixels and its own row of
            buttons — six of them filled the window to say very little. One
            line each, and the actions sit at the end of the line they belong
            to. */}
        {runs && runs.length > 0 && (
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl bg-card ring-1 ring-border/60">
            {runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate font-body text-[13px] text-foreground">
                  {run.sprint_name || run.retro_date}
                  {run.sprint_name && (
                    <span className="ml-2 font-code text-[11px] text-muted-foreground/70">
                      {run.retro_date}
                    </span>
                  )}
                </p>
                <p className="shrink-0 font-code text-[11px] text-muted-foreground tabular-nums">
                  {run.card_count ?? 0} cards · {run.action_count ?? 0} actions
                </p>
                <ResultActions
                  refer={{ kind: 'retro', session_id: sessionId, run_id: run.id }}
                  mode="retro"
                />
              </div>
            ))}
          </div>
        )}

        {runs && runs.length === 0 && !board && (
          <Panel title="No retros yet">
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <DuckMark state="idle" size={28} /> Start a board and send the invite — everyone adds
              cards from their own browser, and yeaboi drafts the action items when you are done.
            </p>
          </Panel>
        )}
      </div>
    </Surface>
  );
}

export default function RetroPage() {
  // The surface is the body's to draw, not this page's: with a board up there
  // is no surface, only the board.
  return (
    <BackendGate>
      <RetroBody />
    </BackendGate>
  );
}
