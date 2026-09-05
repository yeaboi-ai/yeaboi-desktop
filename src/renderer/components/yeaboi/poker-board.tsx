'use client';

// The poker table, played in the window. The staging — the tokens, the app's
// dressing over the board kit, the way out — is `StagedBoard`'s; what is here
// is the ceremony's own boot payload.

import { App as PokerApp } from '@board/poker/App';

import { StagedBoard } from './staged-board';

/**
 * The board's boot payload.
 *
 * Python builds this into the served document (`poker/page.py`'s
 * `board_config`); here it is built for the same shape. Static facts only —
 * everything that moves during a session arrives over the board's own state.
 */
function boot(scope: string) {
  return {
    chrome: {
      mode: 'poker',
      frame: 'planning poker',
      wordmark: 'poker',
      title: 'Planning Poker',
      subtitle: scope,
      facts: [['SCOPE', scope]] as Array<[string, string]>,
      footer: 'yeaboi.ai',
    },
    scope,
    adjectives: ['quick', 'quiet', 'bright', 'steady', 'clever', 'calm'],
    nouns: ['otter', 'heron', 'fox', 'moth', 'pike', 'wren'],
    musicChannels: [],
  };
}

export function PokerBoard({
  boardId,
  scope,
  onLeave,
}: {
  boardId: string;
  scope: string;
  onLeave: () => void;
}) {
  return (
    <StagedBoard boardId={boardId} mode="poker" pidKey="poker_pid" onLeave={onLeave}>
      <PokerApp boot={boot(scope) as never} />
    </StagedBoard>
  );
}
