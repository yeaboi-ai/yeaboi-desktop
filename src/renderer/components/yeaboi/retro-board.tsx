'use client';

// The retro board, played in the window — the same app the team's browsers
// load, on the host's own surface. The staging is `StagedBoard`'s; what is
// here is the ceremony's own boot payload.

import { App as RetroApp } from '@board/retro/App';

import { useBoardChannels, useBoardMusic } from './board-music';
import { StagedBoard } from './staged-board';

/**
 * The board's boot payload, in the shape Python builds for the served document
 * (`retro/page.py`'s `board_config`). Static facts only — the cards, who is
 * here and the timer all arrive over the board's own state.
 */
function boot(sprint: string, musicChannels: { name: string; url: string }[]) {
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
    // The window's own stations, so the board's station list and the dock's
    // are the same list.
    musicChannels,
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
  const music = useBoardMusic();
  const channels = useBoardChannels();
  return (
    <StagedBoard boardId={boardId} mode="retro" pidKey="retro_pid" onLeave={onLeave}>
      <RetroApp boot={boot(sprint, channels) as never} music={music} />
    </StagedBoard>
  );
}
