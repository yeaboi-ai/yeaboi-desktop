// The tag a story wears: the outlet's name, as printed. It opens the outlet's
// home page in the OS browser when the paper knows where that is.

import { tagFor } from '@/lib/news/sources';
import type { NewsItem, NewsSourceStatus } from '@/lib/news/types';

export function SourceTag({
  item,
  sources,
}: {
  item: Pick<NewsItem, 'source_id' | 'source_name'>;
  sources: readonly Pick<NewsSourceStatus, 'id' | 'home_url'>[];
}) {
  const tag = tagFor(item, sources);
  if (!tag.href) return <span className="paper-tag">{tag.label}</span>;
  return (
    <a className="paper-tag" href={tag.href} target="_blank" rel="noreferrer">
      {tag.label}
    </a>
  );
}
