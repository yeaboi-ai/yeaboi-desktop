// The foot of the sheet: one folded line naming the other headlines in this
// edition, opening to the paper's index: outlet, headline, page, each row a
// turn to that page. The shell remembers whether the reader left it open.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { INSIDE_TITLE, insideLabel, insideLines } from '@/lib/news/edition';
import { tagFor } from '@/lib/news/sources';
import type { NewsItem, NewsSourceStatus } from '@/lib/news/types';
import { getPref, setPref } from '@/lib/preferences';

export function Inside({
  stories,
  current,
  sources,
  onTurnTo,
}: {
  stories: readonly NewsItem[];
  current: number;
  sources: readonly Pick<NewsSourceStatus, 'id' | 'home_url'>[];
  onTurnTo: (index: number) => void;
}) {
  const [open, setOpen] = useState(() => getPref('news.insideOpen'));
  const lines = insideLines(stories, current);
  if (lines.length === 0) return null;
  const toggle = () => {
    setOpen(!open);
    setPref('news.insideOpen', !open);
  };
  return (
    <nav className="paper-inside" aria-label={INSIDE_TITLE}>
      <button type="button" className="paper-inside-toggle" aria-expanded={open} onClick={toggle}>
        <span>{insideLabel(open, lines.length)}</span>
        <ChevronDown className="paper-inside-chevron" data-open={open} aria-hidden />
      </button>
      {open && (
        <ol className="paper-inside-list">
          {lines.map((line) => (
            <li key={line.item.id}>
              <button
                type="button"
                className="paper-inside-row"
                onClick={() => onTurnTo(line.index)}
              >
                <span className="paper-inside-outlet">{tagFor(line.item, sources).label}</span>
                <span className="paper-inside-headline">{line.item.title}</span>
                <span className="paper-inside-page">{line.page}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
