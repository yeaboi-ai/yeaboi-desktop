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

import {
  type BoardSnapshot,
  type RetroBoardState,
  type RetroActionItem,
  type RetroReportSummary,
  type RetroRun,
  openActions,
  loadBoards,
  retroHistory,
  startRetroBoard,
} from '@/lib/yeaboi/boards';
import { canPlayBoards } from '@/board/board-api';
import { Columns3 } from 'lucide-react';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { RetroBoard } from '@/components/yeaboi/retro-board';
import { Panel, Surface } from '@/components/yeaboi/surface';
import { Button } from '@/components/ui/button';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How many past retros the ledger shows before it is asked for the rest. */
const LEDGER_SHOWN = 4;

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
    <div className="mb-3 grid grid-cols-2 gap-2">
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

/** The live board, in the card that offered it. One step on from Start rather
 *  than a different screen — so it keeps the same shape, and what carried in
 *  from last time stays beside it. */
function LivePanel({
  board,
  masked,
  onStage,
  onClosed,
  anonNote,
  onAnonymize,
}: {
  board: BoardSnapshot;
  masked: number;
  onStage?: (() => void) | undefined;
  onClosed: (runId: number) => void;
  anonNote: string;
  onAnonymize: (replacements: [string, string][], note: string) => void;
}) {
  return (
    <section className="flex flex-col rounded-2xl p-5 ring-1 ring-border/60">
      <h2 className="font-display text-[19px] leading-none text-foreground">On the board</h2>

      <div className="mt-4">
        <BoardState board={board} />
      </div>

      <div className="mt-auto pt-1">
        {/* One row. Drafting the actions is the host's, and the only thing on
            this page the board itself does not offer; the export and share are
            the same set of choices about the same session, so they stand
            beside it rather than under it. */}
        <BoardHost
          board={board}
          onStage={onStage}
          onClosed={onClosed}
          extras={
            // Drafting them is the board's own — its rail offers it while the
            // cards are still in front of you, which is where the decision is
            // actually made. A second button for it here was the same job
            // named twice.
            <ResultActions
              refer={{ kind: 'retro', session_id: board.session_id }}
              mode="retro"
              anonNote={anonNote}
              onAnonymize={onAnonymize}
            />
          }
        />
        {masked > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            {masked} name{masked === 1 ? '' : 's'} replaced in what leaves here.
          </p>
        )}
      </div>
    </section>
  );
}

/** Starting one, as the decision it is: what it will cover, what it inherits,
 *  and the way in. */
function StartPanel({
  busy,
  carried,
  onStart,
}: {
  busy: boolean;
  carried: number;
  onStart: () => void;
}) {
  return (
    <section className="flex flex-col rounded-2xl p-5 ring-1 ring-border/60">
      <h2 className="font-display text-[19px] leading-none text-foreground">Start a retro</h2>
      <p className="mt-2 font-body text-[13px] leading-relaxed text-muted-foreground">
        A live board your team fills in from their own browsers. Send the invite and everyone adds
        cards at once; yeaboi drafts the action items when you are done.
      </p>
      <ul className="mt-4 space-y-1.5 font-body text-[12px] text-muted-foreground">
        <li className="flex gap-2">
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          Four columns — went well, didn’t, actions, demos.
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          {carried > 0
            ? `${carried} open action${carried === 1 ? '' : 's'} carry in for review.`
            : 'Last retro’s open actions carry in for review.'}
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          Runs in this window, or in a browser for anyone you invite.
        </li>
      </ul>
      <div className="mt-auto pt-5">
        <Button disabled={busy} onClick={onStart}>
          {busy ? 'Opening…' : 'Start a retro'}
        </Button>
      </div>
    </section>
  );
}

const STATUS_WORDS: Record<string, string> = {
  pending: 'open',
  in_progress: 'in progress',
  carried_over: 'carried over',
};

/** What the last retro left behind. The point of a retro is what it changed,
 *  so this is what a page about retros is read for. */
function OpenActions({ rows }: { rows: RetroActionItem[] }) {
  return (
    <section className="flex flex-col rounded-2xl p-5 ring-1 ring-border/60">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[19px] leading-none text-foreground">Open actions</h2>
        {rows.length > 0 && (
          <span className="font-code text-[11px] text-muted-foreground tabular-nums">
            {rows.length}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 font-body text-[13px] leading-relaxed text-muted-foreground">
          Nothing outstanding — the last retro closed everything it opened.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/40">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline gap-3 py-2 first:pt-0">
              <span className="min-w-0 flex-1 font-body text-[13px] leading-snug text-foreground">
                {row.text}
              </span>
              <span className="shrink-0 font-code text-[11px] text-muted-foreground/70">
                {row.author}
                {row.status && STATUS_WORDS[row.status] ? ` · ${STATUS_WORDS[row.status]}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RetroBody() {
  const [runs, setRuns] = useState<RetroRun[] | null>(null);
  const [report, setReport] = useState<RetroReportSummary | null>(null);
  const [allRuns, setAllRuns] = useState(false);
  // The session the history belongs to is a sibling of the rows, not a column
  // on them — an artifact reference needs both halves.
  const [sessionId, setSessionId] = useState('');
  const [liveId, setLiveId] = useState('');
  const [board] = useBoard(liveId);
  // Playing the board in the window: it takes the surface and the app's chrome
  // steps back off its edges until it is left.
  const [staged, setStaged] = useState(false);
  // Which retro the board opens on. Cleared when the board is left, so the
  // next time it is opened it shows today's.
  const [showRun, setShowRun] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');
  const actions = openActions(report);

  useEffect(() => {
    retroHistory().then(
      (envelope) => {
        setRuns(envelope.data?.history ?? []);
        setSessionId(envelope.data?.session_id ?? '');
        setReport(envelope.data?.latest_report ?? null);
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

  // The board is the window, not a panel on it. Rendered outside the surface —
  // no page padding, no centred column, no title above it — because a board
  // inside the box the rest of the page is drawn in is a screen within a
  // screen, and this app is the one running the room.
  if (staged && board) {
    return (
      <RetroBoard
        boardId={board.board_id}
        sprint={board.title}
        showRun={showRun}
        onLeave={() => {
          setStaged(false);
          setShowRun(undefined);
        }}
      />
    );
  }

  return (
    <Surface>
      <div className="flex h-full flex-col gap-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-foreground">Retro</h1>
            <p className="mt-1 font-body text-[13px] text-muted-foreground">
              What the last one changed, and the way into the next.
            </p>
          </div>
        </header>

        {error && <Notice title="Could not start the board" items={[error]} />}

        {/* One card either way. A live board is the same decision one step
            on, not a different screen: the panel that offered it becomes the
            panel that runs it, and what carried in stays beside it. */}
        {runs && (
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {board ? (
              <LivePanel
                board={board}
                masked={mask.length}
                onStage={
                  canPlayBoards()
                    ? () => {
                        setShowRun(undefined);
                        setStaged(true);
                      }
                    : undefined
                }
                onClosed={() => {
                  setLiveId('');
                  setStaged(false);
                  retroHistory().then((envelope) => {
                    setRuns(envelope.data?.history ?? []);
                    setReport(envelope.data?.latest_report ?? null);
                  }, undefined);
                }}
                anonNote={anonNote}
                onAnonymize={(replacements, anon) => {
                  setMask(replacements);
                  setAnonNote(anon);
                }}
              />
            ) : (
              <StartPanel
                busy={busy === 'start'}
                carried={actions.length}
                onStart={() => void start()}
              />
            )}
            <OpenActions rows={actions} />
          </div>
        )}

        {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

        {/* A ledger, not a wall of tiles. Every past retro carried the same
            date twice, two figures set at twenty pixels and its own row of
            buttons — six of them filled the window to say very little. One
            line each, and the actions sit at the end of the line they belong
            to. */}
        {runs && runs.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[15px] leading-none text-muted-foreground">
                Recent retros
              </h2>
              {runs.length > LEDGER_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllRuns((open) => !open)}
                  className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {allRuns ? 'Show fewer' : `Show all ${runs.length}`}
                </button>
              )}
            </div>
            <div className="divide-y divide-border/40 overflow-hidden rounded-2xl ring-1 ring-border/60">
              {(allRuns ? runs : runs.slice(0, LEDGER_SHOWN)).map((run) => (
                <div
                  key={run.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
                >
                  <p className="min-w-0 flex-1 truncate font-body text-[13px] text-foreground">
                    {run.sprint_name || run.retro_date}
                    {run.sprint_name && (
                      <span className="ml-2 font-code text-[11px] text-muted-foreground/70">
                        {run.retro_date}
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 font-code text-[11px] text-muted-foreground tabular-nums">
                    {plural(run.card_count ?? 0, 'card')} ·{' '}
                    {plural(run.action_count ?? 0, 'action')}
                  </p>
                  {/* The board already steps back through these; this points
                      it at one. It needs a board to do it on, so it is offered
                      only while there is one. */}
                  {board && canPlayBoards() && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowRun(run.id);
                        setStaged(true);
                      }}
                    >
                      <Columns3 data-icon="inline-start" />
                      Open
                    </Button>
                  )}
                  <ResultActions
                    refer={{ kind: 'retro', session_id: sessionId, run_id: run.id }}
                    mode="retro"
                  />
                </div>
              ))}
            </div>
          </div>
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
