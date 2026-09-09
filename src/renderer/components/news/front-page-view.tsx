'use client';

// The paper itself: grain, masthead, edition, colophon. Everything that
// decides WHICH paper — fetching, the stale retry, the clock — belongs to
// whoever renders this.
//
// Two callers: the home page, and the screensaver. Sharing the view is what
// makes "the screensaver is the front page" true rather than a resemblance
// that drifts.

import type { ReactNode } from 'react';
import { Edition } from '@/components/news/edition';
import { Masthead } from '@/components/news/masthead';
import { isEmpty, sourcesLine, storiesOf } from '@/lib/news/paper';
import type { MarkKind } from '@/lib/news/persona';
import {
  type Edition as EditionState,
  dateline,
  editionLine,
  refreshLabel,
  volumeLine,
} from '@/lib/news/masthead';
import type { TurnSpeedId } from '@/lib/news/turn';
import type { Paper } from '@/lib/news/types';
import { SHELL_ENTRIES } from '@/lib/yeaboi/shell-changelog';

export function FrontPageView({
  paper,
  now,
  mark,
  speed,
  edition,
  onRefresh,
  engageable = true,
  held = false,
  colophon,
}: {
  paper: Paper | null;
  now: Date;
  mark: MarkKind;
  speed: TurnSpeedId;
  edition: EditionState;
  /** Omitted on a surface with nobody to press it — the masthead hides it. */
  onRefresh?: () => void;
  /** False stops hover and focus pausing the turn; see the screensaver. */
  engageable?: boolean;
  /** Holds the page where it is, whatever the pointer is doing. */
  held?: boolean;
  /** The footer, which differs between the page and the saver. */
  colophon?: ReactNode;
}) {
  const stories = paper ? storiesOf(paper) : [];
  const sources = paper?.sources ?? [];

  return (
    <div className="paper">
      <div className="paper-grain" aria-hidden />
      <Masthead
        dateline={dateline(now)}
        volume={volumeLine(SHELL_ENTRIES[0]?.version ?? '')}
        edition={editionLine(edition, now)}
        refreshLabel={onRefresh ? refreshLabel(edition) : ''}
        onRefresh={onRefresh}
      />
      <Edition
        stories={stories}
        sources={sources}
        mark={mark}
        now={now}
        speed={speed}
        engageable={engageable}
        held={held}
      />
      {paper && isEmpty(paper) && (
        <p className="py-8 text-[14px] text-muted-foreground">Nothing to read yet.</p>
      )}
      {colophon}
    </div>
  );
}

/** The outlets line a caller puts in the colophon. */
export function sourcesColophon(paper: Paper | null): string {
  return paper ? sourcesLine(paper.sources) : '';
}
