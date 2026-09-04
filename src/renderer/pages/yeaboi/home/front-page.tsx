'use client';

// The front page: the masthead, then the edition, one story at a time on a
// slow clock. The paper comes from GET /api/news; a sidecar without the
// route, or one that fails, gets the release notes as the edition and says so
// in the folio line.
//
// The paper in hand is answered at once; when it is stale the sidecar is
// refreshing behind it, so the page asks once more a few seconds later. A
// window coming back to the front asks again, at most every fifteen minutes;
// the folio's button asks for a fresh one now.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAudience } from '@/components/providers/audience-provider';
import { Edition } from '@/components/news/edition';
import { Masthead } from '@/components/news/masthead';
import { fallbackPaper } from '@/lib/news/fallback';
import { nextVisit } from '@/lib/home/wardrobe';
import {
  STALE_RETRY_MS,
  loadFallbackNotes,
  loadPaper,
  paperNow,
  rememberPaper,
  shouldRefetch,
} from '@/lib/news/load';
import { dateline, editionLine, editionOf, refreshLabel, volumeLine } from '@/lib/news/masthead';
import { isEmpty, sourcesLine, storiesOf } from '@/lib/news/paper';
import { markKind } from '@/lib/news/persona';
import type { Paper } from '@/lib/news/types';
import { getPref } from '@/lib/preferences';
import { SHELL_ENTRIES } from '@/lib/yeaboi/shell-changelog';

export function FrontPage() {
  const { audience } = useAudience();
  const [paper, setPaper] = useState<Paper | null>(paperNow);
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState(false);
  const [speed] = useState(() => getPref('news.turnSpeed'));
  const lastAt = useRef(0);
  const asking = useRef(false);
  const now = useMemo(() => new Date(), [paper]);

  // The doors' ducks change on each visit to the home, never mid-visit.
  useEffect(() => {
    nextVisit();
  }, []);

  useEffect(() => {
    let gone = false;
    const fetchPaper = async () => {
      lastAt.current = Date.now();
      try {
        const loaded = await loadPaper();
        if (gone) return;
        if (loaded) {
          rememberPaper(loaded);
          setPaper(loaded);
          setNotes(false);
          setFailed(false);
          return;
        }
        const ledger = await loadFallbackNotes();
        if (gone) return;
        setPaper(fallbackPaper(SHELL_ENTRIES, ledger, new Date()));
        setNotes(true);
        setFailed(false);
      } catch {
        if (gone) return;
        setFailed(true);
        setPaper((current) => current ?? fallbackPaper(SHELL_ENTRIES, null, new Date()));
      }
    };
    void fetchPaper();
    const onFocus = () => {
      if (shouldRefetch(lastAt.current, Date.now())) void fetchPaper();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A stale paper is being refreshed behind the route: ask once more, soon.
  useEffect(() => {
    if (!paper?.stale) return;
    const timer = window.setTimeout(() => {
      loadPaper().then(
        (loaded) => {
          if (loaded) {
            rememberPaper(loaded);
            setPaper(loaded);
          }
        },
        () => {},
      );
    }, STALE_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [paper]);

  // The folio's button: a fresh edition now. The stale paper that comes back
  // starts the retry above, which brings the new one in.
  const refresh = () => {
    if (asking.current) return;
    asking.current = true;
    lastAt.current = Date.now();
    loadPaper({ refresh: true })
      .then((loaded) => {
        if (loaded) {
          rememberPaper(loaded);
          setPaper(loaded);
        }
      })
      .catch(() => {})
      .finally(() => {
        asking.current = false;
      });
  };

  const stories = useMemo(() => (paper ? storiesOf(paper) : []), [paper]);
  const mark = markKind(audience);
  const edition = editionOf(paper, failed, notes);
  const colophon = paper ? sourcesLine(paper.sources) : '';

  return (
    <div className="paper">
      <div className="paper-grain" aria-hidden />
      <Masthead
        dateline={dateline(now)}
        volume={volumeLine(SHELL_ENTRIES[0]?.version ?? '')}
        edition={editionLine(edition, now)}
        refreshLabel={refreshLabel(edition)}
        onRefresh={refresh}
      />
      <Edition
        stories={stories}
        sources={paper?.sources ?? []}
        mark={mark}
        now={now}
        speed={speed}
      />
      {paper && isEmpty(paper) && (
        <p className="py-8 text-[14px] text-muted-foreground">Nothing to read yet.</p>
      )}
      <p className="paper-colophon">
        {colophon}
        {colophon && ' '}
        <Link href="/settings/news" className="paper-colophon-link">
          Choose the outlets.
        </Link>
      </p>
    </div>
  );
}
