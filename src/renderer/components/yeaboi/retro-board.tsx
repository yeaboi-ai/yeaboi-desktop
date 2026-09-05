'use client';

// The retro board, played in the window — the same app the team's browsers
// load, on the host's own surface. The staging is `StagedBoard`'s; what is
// here is the ceremony's own boot payload.

import { App as RetroApp } from '@board/retro/App';

import { StagedBoard } from './staged-board';

/**
 * The board's boot payload, in the shape Python builds for the served document
 * (`retro/page.py`'s `board_config`). Static facts only — the cards, who is
 * here and the timer all arrive over the board's own state.
 */
function boot(sprint: string) {
  return {
    chrome: {
      mode: 'retro',
      frame: 'retrospective',
      wordmark: 'retro',
      title: 'Retro',
      subtitle: sprint,
      facts: (sprint ? [['SPRINT', sprint]] : []) as Array<[string, string]>,
      footer: 'yeaboi.ai',
    },
    sprint,
    adjectives: ['quick', 'quiet', 'bright', 'steady', 'clever', 'calm'],
    nouns: ['otter', 'heron', 'fox', 'moth', 'pike', 'wren'],
    musicChannels: [],
  };
}

export function RetroBoard({
  boardId,
  sprint,
  onLeave,
}: {
  boardId: string;
  sprint: string;
  onLeave: () => void;
}) {
  return (
    <StagedBoard boardId={boardId} mode="retro" pidKey="retro_pid" onLeave={onLeave}>
      <RetroApp boot={boot(sprint) as never} />
    </StagedBoard>
  );
}
