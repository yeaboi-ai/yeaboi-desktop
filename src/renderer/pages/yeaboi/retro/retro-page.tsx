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
import { useSession } from 'next-auth/react';

import {
  type BoardSnapshot,
  type RetroBoardState,
  type OpenAction,
  type RetroReportSummary,
  type RetroRun,
  editAction,
  openActions,
  loadBoards,
  retroHistory,
  startRetroBoard,
} from '@/lib/yeaboi/boards';
import { canPlayBoards } from '@/board/board-api';
import { Columns3 } from 'lucide-react';
import { ActionNote } from './action-note';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { RetroBoard } from '@/components/yeaboi/retro-board';
import { Panel, Surface } from '@/components/yeaboi/surface';
import { Button } from '@/components/ui/button';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How many past retros the ledger shows before it is asked for the rest. */
const LEDGER_SHOWN = 5;

/** And how many there are to ask for. Stated here rather than left to the
 *  tool's own default: how far back the ledger reaches is this page's decision. */
const LEDGER_LIMIT = 30;

/** One ledger row, in px. Asking for the rest scrolls that many rows rather
 *  than growing the box, so the ledger is the same size either way. */
const LEDGER_ROW = 49;

/** How far the fade at a scrolled edge reaches. */
const FADE = 28;

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
    <div className="mb-3 grid flex-1 grid-cols-2 grid-rows-2 gap-2">
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
    // No frame, like the wall beside it. The grids inside are already boxes,
    // and a box around four boxes is the screen saying the same thing twice.
    <section className="flex flex-col py-5">
      <h2 className="font-display text-[19px] leading-none text-foreground">On the board</h2>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <BoardState board={board} />
      </div>

      <div className="pt-1">
        {/* One row. Drafting the actions is the host's, and the only thing on
            this page the board itself does not offer; the export and share are
            the same set of choices about the same session, so they stand
            beside it rather than under it. */}
        <BoardHost
          fill
          board={board}
          onStage={onStage}
          onClosed={onClosed}
          extras={
            // Drafting them is the board's own — its rail offers it while the
            // cards are still in front of you, which is where the decision is
            // actually made. A second button for it here was the same job
            // named twice.
            <ResultActions
              fill
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

/**
 * A box that scrolls at a fixed height, fading whichever edge has more past it.
 *
 * The fade is a mask rather than a gradient laid over the rows: the page has no
 * ground of its own here, so an overlay would be a smear of one colour on
 * whatever happens to be behind it.
 */
function ScrollBox({
  enabled,
  height,
  className,
  children,
}: {
  enabled: boolean;
  height: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [edge, setEdge] = useState({ top: false, bottom: false });

  const read = (el: HTMLElement | null) => {
    if (!el) return;
    setEdge((was) => {
      const top = el.scrollTop > 2;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      return was.top === top && was.bottom === bottom ? was : { top, bottom };
    });
  };

  if (!enabled) return <div className={className}>{children}</div>;

  const from = edge.top ? `transparent 0, #000 ${FADE}px` : '#000 0';
  const to = edge.bottom ? `#000 calc(100% - ${FADE}px), transparent 100%` : '#000 100%';
  const mask = `linear-gradient(to bottom, ${from}, ${to})`;

  return (
    <div
      ref={read}
      onScroll={(event) => read(event.currentTarget)}
      style={{ height, maskImage: mask, WebkitMaskImage: mask }}
      className={`slim-scroll overflow-y-auto overscroll-contain pr-2 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

/** What the last retro left behind. The point of a retro is what it changed,
 *  so this is what a page about retros is read for. */
function OpenActions({
  rows,
  busy,
  onEdit,
  onClose,
}: {
  rows: OpenAction[];
  /** The action a correction is in flight for, by id. */
  busy: string;
  onEdit(row: OpenAction, text: string): void;
  onClose(row: OpenAction, status: string): void;
}) {
  return (
    // No frame, and hard left. Paper on a wall is the object; a box drawn
    // around it is a second object saying the same thing more quietly, and
    // padding where the box was is the box's ghost.
    <section className="flex flex-col py-5">
      {/* The count beside the name, not pushed to the far edge: the column is
          wide and the notes are on the left of it, so a figure out at the
          right belongs to nothing. */}
      <div className="flex items-baseline gap-2.5">
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
        // Paper on a wall, not rows in a table. They are what the last retro
        // asked of you and they are meant to be in the way — a list of two
        // lines between rules reads as a footnote to the panel it is in.
        //
        // `items-start`, or the tallest note on a row sets the height of every
        // note beside it: a pad's sheets are the same size, what is written on
        // them is not.
        <ul className="mt-4 flex flex-wrap items-start content-start gap-3">
          {rows.map((row) => (
            <ActionNote
              key={row.id}
              row={row}
              busy={busy === row.id}
              onEdit={onEdit}
              onClose={onClose}
            />
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
  // Titled, because more than one thing on this page can fail and "could not
  // start the board" over a refused correction is a lie.
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');
  // The action a correction is in flight for. One at a time is enough: each
  // one re-reads the whole report, and two in flight would race that read.
  const [correcting, setCorrecting] = useState('');
  const { data: auth } = useSession();
  const actions = openActions(report);

  /** Apply one correction to an open action and re-read the report.
   *
   *  Not an optimistic edit: the engine can refuse — a cap, a conflict with a
   *  correction somebody made on the shared document — and a note that moved
   *  and then moved back is worse than one that waits. */
  async function correct(row: OpenAction, change: { text: string } | { status: string }) {
    setCorrecting(row.id);
    setError(null);
    try {
      const envelope = await editAction(sessionId, row, change, auth?.user?.name ?? '');
      const result = envelope.data as { refused?: { reason: string }[] };
      if (result.refused?.length) {
        setError({ title: 'The correction was refused', message: result.refused[0]!.reason });
      }
      const next = await retroHistory(LEDGER_LIMIT);
      setReport(next.data?.latest_report ?? null);
    } catch (e) {
      setError({ title: 'Could not change the action', message: (e as Error).message });
    }
    setCorrecting('');
  }

  useEffect(() => {
    retroHistory(LEDGER_LIMIT).then(
      (envelope) => {
        setRuns(envelope.data?.history ?? []);
        setSessionId(envelope.data?.session_id ?? '');
        setReport(envelope.data?.latest_report ?? null);
      },
      (e: Error) => setError({ title: 'Could not read the retro history', message: e.message }),
    );
    loadBoards().then(
      (body) => setLiveId(body.boards.find((one) => one.kind === 'retro')?.board_id ?? ''),
      () => undefined,
    );
  }, []);

  async function start() {
    setBusy('start');
    setError(null);
    try {
      const started = await startRetroBoard();
      setLiveId(started.board_id);
      // Starting a board is asking to be on it. The host who opened it is the
      // one person who should not have to find the way in.
      if (canPlayBoards()) setStaged(true);
    } catch (e) {
      setError({ title: 'Could not start the board', message: (e as Error).message });
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
        {/* The way into the next one is a button, not a panel. What it does
            needs saying once, not on every visit — and a card explaining it
            was what forced a second column with nothing to put in it. */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-foreground">Retro</h1>
            <p className="mt-1 font-body text-[13px] text-muted-foreground">
              What the last one changed, and the way into the next.
            </p>
          </div>
          {runs && !board && (
            <Button disabled={busy === 'start'} onClick={() => void start()}>
              {busy === 'start' ? 'Opening…' : 'Start a retro'}
            </Button>
          )}
        </header>

        {error && <Notice title={error.title} items={[error.message]} />}

        {/* One card either way. A live board is the same decision one step
            on, not a different screen: the panel that offered it becomes the
            panel that runs it, and what carried in stays beside it. */}
        {runs && (
          <div
            className={
              board
                ? 'grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'
                : ''
            }
          >
            <OpenActions
              rows={actions}
              busy={correcting}
              onEdit={(row, text) => void correct(row, { text })}
              onClose={(row, status) => void correct(row, { status })}
            />
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
                  retroHistory(LEDGER_LIMIT).then((envelope) => {
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
            ) : null}
          </div>
        )}

        {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

        {/* A ledger, not a wall of tiles. Every past retro carried the same
            date twice, two figures set at twenty pixels and its own row of
            buttons — six of them filled the window to say very little. One
            line each, and the actions sit at the end of the line they belong
            to. */}
        {/* At the foot of the screen. What you came here to do is at the top;
            what you did last is the floor under it, not the next thing down
            the page. */}
        {runs && runs.length > 0 && (
          <div className="mt-auto">
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
            {/* Opened out, the ledger scrolls rather than growing: the box is
                the same height either way, and the rows above and below what
                it is showing fade out at its edges. */}
            <ScrollBox
              enabled={allRuns}
              height={LEDGER_SHOWN * LEDGER_ROW}
              className="divide-y divide-border/40"
            >
              {(allRuns ? runs : runs.slice(0, LEDGER_SHOWN)).map((run) => (
                <div key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
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
                  {/* The board steps back through these; this points it at
                      one. Shown either way rather than appearing with the
                      board — a control that comes and goes is a control
                      nobody learns — but it never starts one: reading a
                      retro that already happened is not a reason to open a
                      room and invite the team into it. */}
                  {canPlayBoards() && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!board}
                      title={board ? undefined : 'Needs a board — start one above'}
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
            </ScrollBox>
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
