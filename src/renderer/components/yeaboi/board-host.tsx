'use client';

// The host's controls for a live board, wherever they are drawn — the poker
// dashboard, the retro board's page, the table's own page. One component
// because two rules have to hold in all of them:
//
// * the link's `notice` is rendered above everything else. It is non-empty only
//   for an expiry, and once a quick tunnel expires the invite already sent to
//   everyone is permanently dead — a sticky status line must not swallow that.
// * Copy invite hands over the participant link with the code in its fragment,
//   never the host link. The host link carries the admin secret, which would
//   make every reader a host.

import { useEffect, useState } from 'react';

import { quip } from '@/lib/yeaboi/ambience';
import {
  type BoardSnapshot,
  boardInvite,
  closeBoard,
  loadBoard,
  openBoardWindow,
  retryLink,
} from '@/lib/yeaboi/boards';
import { Button } from '@/components/ui/button';

/** How often a live board is re-read. The board itself pushes to the browsers
 *  that joined it; this is the host's own view catching up. */
export const BOARD_POLL_MS = 2000;

/** A live board, kept current. `null` while it is loading and after it has been
 *  closed somewhere else. */
export function useBoard(boardId: string): [BoardSnapshot | null, string] {
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!boardId) return;
    const refresh = () => loadBoard(boardId).then(setBoard, (e: Error) => setError(e.message));
    refresh();
    const timer = setInterval(refresh, BOARD_POLL_MS);
    return () => clearInterval(timer);
  }, [boardId]);

  return [board, error];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/40 px-3 py-2">
      <p className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-code text-[12px] text-foreground">{value}</p>
    </div>
  );
}

export function BoardHost({
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
      {board.link.notice && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 font-body text-[12px] text-foreground ring-1 ring-destructive/30">
          {board.link.notice}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Join code" value={board.display_code} />
        <Field
          label="Participant link"
          value={board.share_url || board.link.status || 'starting…'}
        />
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
      {message && <p className="font-body text-[12px] text-muted-foreground">{message}</p>}
    </div>
  );
}
