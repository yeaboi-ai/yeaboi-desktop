'use client';

// The table, drawn by the app.
//
// The game itself belongs to the board server — it owns the round, the votes
// and the reveal, and every teammate's browser is talking to the same state
// machine. This is the host's seat at that table, in the app's own hand rather
// than a web page in a hole: the same state, the same actions, read and sent
// through main (`main/board-play.ts`), which is where the host secret stays.
//
// While it is open the app steps back — the rail, the dock and Niko retreat off
// their edges, so the table is the window. The duck stays.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

/** The hand everyone is dealt. The board takes whatever string it is sent; this
 *  is the deck the app offers. */
const DECK = ['0', '1', '2', '3', '5', '8', '13', '21', '?'] as const;

/** How often the table re-reads the board. The browsers on it are on a live
 *  stream; the app polls, which is enough for a round that moves on a vote. */
const POLL_MS = 1200;

/** The flag the rail, the dock and Niko read to get out of the way. */
const STAGED = 'boardStaged';

interface Ticket {
  key?: string;
  summary?: string;
  type?: string;
  assignee?: string;
  state?: string;
  description_text?: string;
  acceptance_text?: string;
  story_points?: number | null;
  final_points?: number | null;
  estimated?: boolean;
}

interface TicketMeta {
  key: string;
  summary: string;
  estimated: boolean;
  final_points: number | null;
  story_points: number | null;
}

interface Vote {
  name?: string;
  avatar?: string;
  voted?: boolean;
  value?: string;
}

interface TableState {
  phase: string;
  ticket_index: number;
  ticket_count: number;
  ticket: Ticket | null;
  tickets_meta?: TicketMeta[];
  votes?: Vote[];
  mine_value?: string;
  distribution?: Record<string, number>;
  median?: number | null;
  suggestion?: string | number | null;
  progress?: { estimated: number; total: number };
  presence?: { name?: string; avatar?: string }[];
  notice?: string;
}

interface PlayBridge {
  boardState: (boardId: string) => Promise<{ ok?: boolean; state?: TableState; error?: string }>;
  boardAct: (
    boardId: string,
    action: string,
    payload?: object,
  ) => Promise<{ ok?: boolean; state?: TableState; error?: string }>;
}

function bridge(): PlayBridge | null {
  const found = (window as unknown as { yeaboi?: Partial<PlayBridge> }).yeaboi;
  if (!found?.boardState || !found.boardAct) return null;
  return found as PlayBridge;
}

/** Whether the app can play a board at all — the shell has to be here to hold
 *  the host link. */
export function canPlayBoards(): boolean {
  return bridge() !== null;
}

function Card({ value, chosen, onPick }: { value: string; chosen: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`h-16 w-12 rounded-xl font-display text-[18px] transition-all duration-150 ${
        chosen
          ? '-translate-y-1.5 bg-primary text-primary-foreground shadow-lg'
          : 'bg-card text-foreground ring-1 ring-border/60 hover:-translate-y-1 hover:ring-primary/40'
      }`}
    >
      {value}
    </button>
  );
}

/** One seat: who it is, and what they have done about this round. */
function Seat({ vote, revealed }: { vote: Vote; revealed: boolean }) {
  const said = revealed ? (vote.value ?? '—') : vote.voted ? '✓' : '…';
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span aria-hidden className="text-[14px]">
        {vote.avatar || '🙂'}
      </span>
      <span className="min-w-0 flex-1 truncate font-body text-[12px] text-foreground">
        {vote.name || 'Someone'}
      </span>
      <span
        className={`w-8 text-right font-code text-[12px] ${
          revealed ? 'text-foreground' : vote.voted ? 'text-primary' : 'text-muted-foreground/50'
        }`}
      >
        {said}
      </span>
    </li>
  );
}

export function PokerTable({ boardId, onLeave }: { boardId: string; onLeave: () => void }) {
  const [state, setState] = useState<TableState | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const read = useCallback(async () => {
    const shell = bridge();
    if (!shell || busy.current) return;
    const answer = await shell.boardState(boardId);
    if (answer.ok && answer.state) setState(answer.state);
    else if (answer.error) setError(answer.error);
  }, [boardId]);

  const act = useCallback(
    async (action: string, payload: object = {}) => {
      const shell = bridge();
      if (!shell) return;
      busy.current = true;
      const answer = await shell.boardAct(boardId, action, payload);
      busy.current = false;
      if (answer.state) setState(answer.state);
      setError(answer.ok ? '' : (answer.error ?? ''));
    },
    [boardId],
  );

  useEffect(() => {
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    document.documentElement.dataset[STAGED] = boardId;
    return () => {
      clearInterval(timer);
      delete document.documentElement.dataset[STAGED];
    };
  }, [boardId, read]);

  if (!state) {
    return (
      <p className="font-body text-[12px] text-muted-foreground">
        {error || 'Taking a seat at the table…'}
      </p>
    );
  }

  const revealed = state.phase !== 'voting';
  const ticket = state.ticket;
  const votes = state.votes ?? [];
  const waiting = votes.filter((vote) => !vote.voted).length;
  const suggestion = state.suggestion === null ? '' : String(state.suggestion ?? '');

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
            Ticket {state.ticket_index + 1} of {state.ticket_count} ·{' '}
            {state.progress?.estimated ?? 0} estimated
          </p>
          <h2 className="mt-1 truncate font-display text-[20px] text-foreground">
            <span className="font-code text-[13px] text-muted-foreground">{ticket?.key}</span>{' '}
            {ticket?.summary}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={state.ticket_index === 0}
            onClick={() => void act('admin/goto', { index: state.ticket_index - 1 })}
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={state.ticket_index + 1 >= state.ticket_count}
            onClick={() => void act('admin/goto', { index: state.ticket_index + 1 })}
          >
            ›
          </Button>
          <button
            type="button"
            onClick={onLeave}
            className="ml-1 font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Leave the table
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <div className="flex flex-col gap-4">
          {/* What is being estimated. Everything the tracker had to say about it,
              because the argument is usually about something that is written
              down and unread. */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {[ticket?.type, ticket?.state, ticket?.assignee].filter(Boolean).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-secondary/50 px-2 py-0.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </span>
              ))}
              {typeof ticket?.story_points === 'number' && (
                <span className="rounded-full bg-secondary/50 px-2 py-0.5 font-code text-[10px] text-muted-foreground">
                  was {ticket.story_points}
                </span>
              )}
            </div>
            {ticket?.description_text && (
              <p className="whitespace-pre-line font-body text-[13px] leading-6 text-foreground/90">
                {ticket.description_text}
              </p>
            )}
            {ticket?.acceptance_text && (
              <div className="mt-3 border-t border-border/40 pt-3">
                <p className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
                  Acceptance
                </p>
                <p className="mt-1 whitespace-pre-line font-body text-[12px] leading-6 text-muted-foreground">
                  {ticket.acceptance_text}
                </p>
              </div>
            )}
          </section>

          {/* The hand. The host plays too — a host who cannot vote is a host who
              anchors the room by talking instead. */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-body text-[13px] font-medium text-foreground">
                {revealed ? 'The round' : 'Your card'}
              </h3>
              <p className="font-body text-[11px] text-muted-foreground">
                {revealed
                  ? `Median ${state.median ?? '—'}${suggestion ? ` · suggestion ${suggestion}` : ''}`
                  : waiting > 0
                    ? `${waiting} still thinking`
                    : 'everyone has voted'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DECK.map((value) => (
                <Card
                  key={value}
                  value={value}
                  chosen={state.mine_value === value}
                  onPick={() =>
                    void act(state.mine_value === value ? 'vote/clear' : 'vote', { value })
                  }
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!revealed && (
                <Button size="sm" onClick={() => void act('admin/reveal')}>
                  Reveal
                </Button>
              )}
              {revealed && (
                <>
                  <Button
                    size="sm"
                    disabled={!suggestion}
                    onClick={() =>
                      void act('admin/finalize', { points: suggestion }).then(() => {
                        if (state.ticket_index + 1 < state.ticket_count) {
                          void act('admin/goto', { index: state.ticket_index + 1 });
                        }
                      })
                    }
                  >
                    Accept {suggestion || '—'} and move on
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void act('admin/revote')}>
                    Vote again
                  </Button>
                </>
              )}
              {error && <p className="font-body text-[11px] text-muted-foreground">{error}</p>}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <h3 className="mb-2 font-body text-[13px] font-medium text-foreground">
              At the table{votes.length ? ` · ${votes.length}` : ''}
            </h3>
            {votes.length === 0 ? (
              <p className="font-body text-[12px] text-muted-foreground">
                Nobody has joined yet — hand out the code and they arrive here.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {votes.map((vote, index) => (
                  <Seat key={vote.name ?? index} vote={vote} revealed={revealed} />
                ))}
              </ul>
            )}
          </section>

          {/* The run of tickets, so the room can see how far there is to go and
              the host can jump to whichever one is being argued about. */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <h3 className="mb-2 font-body text-[13px] font-medium text-foreground">The stack</h3>
            <ul className="max-h-[240px] overflow-y-auto">
              {(state.tickets_meta ?? []).map((meta, index) => (
                <li key={meta.key}>
                  <button
                    type="button"
                    onClick={() => void act('admin/goto', { index })}
                    className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      index === state.ticket_index ? 'bg-secondary/60' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <span className="font-code text-[10px] text-muted-foreground">{meta.key}</span>
                    <span className="min-w-0 flex-1 truncate font-body text-[12px] text-foreground">
                      {meta.summary}
                    </span>
                    <span className="font-code text-[11px] text-muted-foreground">
                      {meta.estimated ? (meta.final_points ?? '✓') : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {state.notice && (
        <p className="font-body text-[12px] text-muted-foreground">{state.notice}</p>
      )}
    </div>
  );
}
