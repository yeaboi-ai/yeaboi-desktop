// One story, set like a front page's lead: the headline across the measure,
// a rule, then the picture beside the body, the byline, and the one button
// that opens the story. An outlet opens in the OS browser through main's
// window-open handler, like every external link.

import Link from 'next/link';
import { Scene } from './scene';
import { isExternal, readMoreLabel } from '@/lib/news/paper';
import { personaFor, type MarkKind } from '@/lib/news/persona';
import { sceneFor } from '@/lib/news/scenes/scenes';
import { byline } from '@/lib/news/time';
import type { NewsItem } from '@/lib/news/types';

export function Story({ item, mark, now }: { item: NewsItem; mark: MarkKind; now: Date }) {
  const label = readMoreLabel(item);
  return (
    <article className="paper-story">
      <h2 className="paper-headline">{item.title}</h2>
      <hr className="paper-headline-rule" />
      <div className="paper-spread">
        <Scene id={sceneFor(item)} persona={personaFor(item)} mark={mark} />
        <div className="paper-text">
          {item.summary && <p className="paper-body">{item.summary}</p>}
          <p className="paper-byline">{byline(item, now)}</p>
          {isExternal(item.url) ? (
            <a className="paper-read" href={item.url} target="_blank" rel="noreferrer">
              {label}
            </a>
          ) : (
            <Link className="paper-read" href={item.url}>
              {label}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
