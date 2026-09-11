'use client';

// The host's controls for a live board, wherever they are drawn — the poker
// dashboard, the retro board's page, the table's own page.
//
// Inviting people is not here. The board hands out its own invite, in the room
// where the host is already standing, and a Slack ceremony posts the link by
// itself — a join code and a URL sitting on the dashboard were a third place to
// read the same thing from, and the one nobody was looking at.
//
// The link's `notice` still is: it is non-empty only for an expiry, and once a
// quick tunnel expires the invite already sent to everyone is permanently dead.

import { useEffect, useState } from 'react';

import { quip } from '@/lib/yeaboi/ambience';
import {
  type BoardSnapshot,
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
    if (!boardId) {
      // No board is not the same as "the last one I saw": ending a session
      // clears the id, and a hook that only ever adds left the table on screen
      // with its join code after it had been closed.
      setBoard(null);
      setError('');
      return;
    }
    const refresh = () => loadBoard(boardId).then(setBoard, (e: Error) => setError(e.message));
    refresh();
    const timer = setInterval(refresh, BOARD_POLL_MS);
    return () => clearInterval(timer);
  }, [boardId]);

  return [board, error];
}

export function BoardHost({
  board,
  onClosed,
  onStage,
  extras,
  fill,
}: {
  board: BoardSnapshot;
  onClosed: (runId: number) => void;
  /** Where the app can play the board itself. Given, it becomes the way in and
   *  a window is the second choice; withheld (a surface with nowhere to put a
   *  board), the window is the only way in. */
  onStage?: () => void;
  /** Whatever else this ceremony does with a live board. On the row, not
   *  under it: three rows of two buttons is a stack of rows, not a set of
   *  choices. */
  extras?: React.ReactNode;
  /** Share the row's width between the controls rather than leaving them
   *  bunched at its left end. For a panel the row is the full width of. */
  fill?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
      {/* Its own buttons only: whatever `extras` is asks for the share it
          needs, and one share for a pair of controls squeezes them onto two
          lines. */}
      <div className={`flex flex-wrap items-center gap-2 ${fill ? '[&>button]:flex-1' : ''}`}>
        {/* One way in. The board plays here now, so a second copy of it in a
            window of its own is two rooms with the same people in them — the
            window is only the way in where the app cannot stage a board. */}
        <Button size="sm" onClick={onStage ? onStage : () => void openBoardWindow(board.board_id)}>
          Open the board
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
        {extras}
      </div>
      {message && <p className="font-body text-[12px] text-muted-foreground">{message}</p>}
    </div>
  );
}
