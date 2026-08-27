'use client';

// The live retro board's host view — the cards as they arrive, the invite, and
// the two things only the host does: draft the action items, and end it.
//
// The board itself is a separate top-level window (a board page refuses to be
// framed — it goes through the preload bridge, not an iframe). This page is
// the ceremony's control strip.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { quip } from '@/lib/yeaboi/ambience';
import {
  type BoardSnapshot,
  type RetroBoardState,
  type RetroCard,
  boardInvite,
  closeBoard,
  generateActionItems,
  loadBoard,
  maskText,
  openBoardWindow,
  retryLink,
} from '@/lib/yeaboi/boards';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button, buttonVariants } from '@/components/ui/button';

const GRID_TITLES: Record<string, string> = {
  went_well: 'Went well',
  didnt_go_well: "Didn't go well",
  action_items: 'Action items',
  demos: 'Demos',
};

/** How often a live board is re-read. The board itself pushes to the browsers
 *  that joined it; this is the host's own view catching up. */
const POLL_MS = 2000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function useBoard(boardId: string): [BoardSnapshot | null, string, () => void] {
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState('');

  function refresh() {
    if (!boardId) return;
    loadBoard(boardId).then(setBoard, (e: Error) => setError(e.message));
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  return [board, error, refresh];
}

// The host controls a live board carries, whatever kind it is: the join code,
// the invite, the way into the board window, and the way out.
//
// Two rules this component exists to keep in one place:
//
// * the link's `notice` is rendered above everything else. It is non-empty only
//   for an expiry, and once a quick tunnel expires the invite already sent to
//   everyone is permanently dead — a sticky status line must not swallow that.
// * Copy invite hands over the participant link with the code in its fragment,
//   never the host link. The host link carries the admin secret, which would
//   make every reader a host.
function BoardHost({
  board,
  onClosed,
}: {
  board: BoardSnapshot;
  onClosed: (runId: number) => void;
}) {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (board.link.state !== 'ready') {
      setInvite('');
      return;
    }
    boardInvite(board.board_id).then(
      (body) => setInvite(body.invite),
      () => undefined,
    );
  }, [board.board_id, board.link.state]);

  async function copyInvite() {
    if (!invite) {
      // Never a half-invite: before the tunnel lands there is no address that
      // works for a reader, and a code alone sends the host into a chat window
      // with nothing to click.
      setMessage('The secure link is still starting — try again in a moment.');
      return;
    }
    await navigator.clipboard.writeText(invite);
    setMessage('Copied the invite to your clipboard.');
  }

  async function end() {
    setBusy(true);
    const result = await closeBoard(board.board_id);
    setBusy(false);
    // A finished poker table has a number to show for it; a retro's result is
    // the actions, which are drafted on the board rather than at the close.
    if (board.kind === 'poker') quip('poker_done');
    onClosed(result.run_id);
  }

  return (
    <div className="space-y-3">
      {board.link.notice && <Notice title="Secure link" items={[board.link.notice]} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-secondary/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Join code</p>
          <p className="text-[12px] font-mono text-foreground break-all">{board.display_code}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Participant link
          </p>
          <p className="text-[12px] font-mono text-foreground break-all">
            {board.share_url || board.link.status || 'starting…'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void openBoardWindow(board.board_id)}>
          Open the board
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void copyInvite()}>
          Copy invite
        </Button>
        {board.link.failed && (
          <Button
            size="sm"
            variant="secondary"
            disabled={board.link.starting}
            onClick={() => void retryLink(board.board_id).then(() => setMessage(''))}
          >
            Retry link
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void end()}>
          {busy ? 'Closing…' : 'End session'}
        </Button>
      </div>
      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
    </div>
  );
}

function RetroBoardBody({ boardId }: { boardId: string }) {
  const [board, error, refresh] = useBoard(boardId);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(0);
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');

  async function draft() {
    if (!board) return;
    setBusy(true);
    try {
      const result = await generateActionItems(board.board_id);
      setMessage(result.message);
      quip('actions_done');
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(false);
  }

  if (closed) {
    return (
      <Section title="Retro recorded">
        <p className="text-[13px] text-muted-foreground">
          The board is closed and the retro is saved.
        </p>
        <div className="mt-3">
          <Link href="/humans/retro" className={buttonVariants({ size: 'sm' })}>
            Back to the retros
          </Link>
        </div>
      </Section>
    );
  }
  if (error) return <Notice title="This board is not live" items={[error]} />;
  if (!boardId) return <Notice title="No board" items={['Start one from the Retro page.']} />;
  if (!board) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const state = board.state as unknown as RetroBoardState;
  const grids = state.grids ?? {};

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-foreground">Retro — {board.title}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Everyone adds cards from their own browser; the board updates as they land.
        </p>
      </header>

      <BoardHost board={board} onClosed={(runId) => setClosed(runId || -1)} />

      <div>
        <Button disabled={busy} onClick={() => void draft()}>
          {busy ? 'Drafting…' : 'Generate action items'}
        </Button>
      </div>
      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}

      <ResultActions
        refer={{ kind: 'retro', session_id: board.session_id }}
        mode="retro"
        anonNote={anonNote}
        onAnonymize={(replacements, note) => {
          setMask(replacements);
          setAnonNote(note);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(grids).map(([key, cards]) => (
          <Section key={key} title={`${GRID_TITLES[key] ?? key} (${cards.length})`}>
            {cards.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {cards.map((card: RetroCard) => (
                  <li key={card.id} className="text-[13px] text-foreground">
                    <span>{maskText(card.text, mask)}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {' '}
                      — {maskText(card.author, mask)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ))}
      </div>

      {state.carried?.length > 0 && (
        <Section title="Last sprint's actions">
          <ul className="space-y-1.5">
            {state.carried.map((item, index) => (
              <li key={index} className="text-[13px] text-muted-foreground">
                {maskText(item.text, mask)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function RetroBoardPage() {
  const [searchParams] = useSearchParams();
  /** The `?id=` this board page was opened with. */
  const boardId = searchParams.get('id') ?? '';
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <RetroBoardBody boardId={boardId} />
      </div>
    </BackendGate>
  );
}
