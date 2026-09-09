'use client';

// The front page as a screensaver: the same paper the home shows, turning
// itself while nobody is here.
//
// It fetches once, on mount — no focus or visibility refetch, because the
// saver is showing precisely because nobody is at the window. A paper already
// in hand paints immediately.
//
// Three things make it behave as a screensaver rather than a page:
//
//  - pointer-events-none on the root, unless the modifier is held. The pointer
//    is usually resting over the
//    overlay while the saver runs; without this the edition's hover pause
//    would freeze the paper on story one, and a story link would be clickable
//    under a cursor that is meant to be hidden. The overlay's own capture
//    handlers still see the event that dismisses it — they are bound on the
//    overlay, not here.
//  - engageable={false}, which disables that pause outright rather than
//    relying on the pointer never reaching it.
//  - it never shows an error and never shows nothing. News off, offline, or
//    no route at all all fall back to the release-notes paper; someone who
//    chose this saver wants a front page, not an explanation.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FrontPageView } from '@/components/news/front-page-view';
import { fallbackPaper } from '@/lib/news/fallback';
import { loadFallbackNotes, loadPaper, paperNow, rememberPaper } from '@/lib/news/load';
import { editionOf } from '@/lib/news/masthead';
import type { MarkKind } from '@/lib/news/persona';
import { cn } from '@/lib/utils';
import type { Paper } from '@/lib/news/types';
import type { TurnSpeedId } from '@/lib/news/turn';
import { getPref } from '@/lib/preferences';
import { ScreensaverCanvas } from './screensaver-canvas';
import { DEFAULT_SAVER_STYLE } from '@/lib/screensaver/styles';
import { SHELL_ENTRIES } from '@/lib/yeaboi/shell-changelog';

/** The same mark the home page draws. */
const MARK: MarkKind = 'duck';

/** Nothing turns by hand on an idle screen. */
function saverSpeed(): TurnSpeedId {
  const stored = getPref('news.turnSpeed');
  return stored === 'hand' ? 'slow' : stored;
}

export function FrontPageSaver({ still, reaching }: { still: boolean; reaching: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const [paper, setPaper] = useState<Paper | null>(paperNow);
  const [notes, setNotes] = useState(false);
  const [failed, setFailed] = useState(false);
  const speed = useMemo(saverSpeed, []);
  const now = useMemo(() => new Date(), [paper]);

  useEffect(() => {
    let gone = false;
    const toNotes = async () => {
      const ledger = await loadFallbackNotes().catch(() => null);
      if (gone) return;
      setPaper(fallbackPaper(SHELL_ENTRIES, ledger, new Date()));
      setNotes(true);
    };
    loadPaper().then(
      (loaded) => {
        if (gone) return;
        // A paper the sidecar is serving with news switched off is not a paper.
        if (loaded && loaded.enabled !== false) {
          rememberPaper(loaded);
          setPaper(loaded);
          setNotes(false);
          return;
        }
        void toNotes();
      },
      () => {
        if (gone) return;
        setFailed(true);
        void toNotes();
      },
    );
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (!reaching) surface.current?.scrollTo({ top: 0 });
  }, [reaching]);

  // Belt and braces: the release-notes paper is built from a committed ledger
  // and cannot be empty, but a saver that draws nothing is worse than a duck.
  if (!paper) {
    return (
      <ScreensaverCanvas style={DEFAULT_SAVER_STYLE} still={still} className="h-full w-full" />
    );
  }

  return (
    <div
      ref={surface}
      className={cn(
        'h-full w-full px-6 pt-10',
        reaching ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden pointer-events-none',
      )}
    >
      <FrontPageView
        paper={paper}
        now={now}
        mark={MARK}
        speed={speed}
        edition={editionOf(paper, failed, notes)}
        engageable={false}
        held={reaching}
      />
    </div>
  );
}
