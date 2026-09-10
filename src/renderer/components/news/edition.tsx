// The edition: one story up at a time, the kicker naming its desk and the
// numerals saying where the reader is. The page turns on a clock and by
// hand; the clock stops while the reader is on the page and picks up where
// it left off. The story shown is worked out from time elapsed and turns
// made, the tip companion's arithmetic, so the two never fight.
//
// A turn is the top sheet lifted off the pile: forward, the story leaving
// is picked up, carried off to the left and uncovers the one arriving; back,
// the story arriving comes in from the left and is laid down over the one
// leaving. The motion is one CSS keyframe, played in reverse for a back turn.
// Under reduced motion the sheets simply swap.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Inside } from './inside';
import { SourceTag } from './source-tag';
import { Story } from './story';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { kicker } from '@/lib/news/paper';
import type { MarkKind } from '@/lib/news/persona';
import {
  PAGE_TURN_MS,
  TURN_MS,
  counterLine,
  periodFor,
  resolveIndex,
  turnDirection,
  type TurnDirection,
  type TurnSpeedId,
} from '@/lib/news/turn';
import type { NewsItem, NewsSourceStatus } from '@/lib/news/types';

/** How often the clock is read while it runs. */
const TICK_MS = 50;

interface Leaving {
  item: NewsItem;
  direction: TurnDirection;
}

export function Edition({
  stories,
  sources,
  mark,
  now,
  speed,
  engageable = true,
  held = false,
}: {
  stories: NewsItem[];
  sources: readonly NewsSourceStatus[];
  mark: MarkKind;
  now: Date;
  speed: TurnSpeedId;
  /** Whether hovering or focusing holds the page. The screensaver says no:
   *  the pointer is usually resting over it, which would freeze the paper on
   *  story one for as long as nobody moved the mouse. */
  engageable?: boolean;
  /** The reader is holding the page open. The screensaver's reach sets it: the
   *  paper must not turn out from under a story someone is deciding to click. */
  held?: boolean;
}) {
  const reduced = useReducedMotion();
  const count = stories.length;
  const period = periodFor(speed);
  const [elapsed, setElapsed] = useState(0);
  const [offset, setOffset] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  const running = !held && !(engageable && engaged) && !reduced && count > 1 && period > 0;
  useEffect(() => {
    if (!running) return;
    const from = elapsedRef.current;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(from + (Date.now() - startedAt)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const index = resolveIndex(elapsed, offset, count, period || PAGE_TURN_MS);
  const story = stories[index];

  // The story that was up before this one, so the turn has two sheets to fold.
  const shownRef = useRef<{ index: number; item: NewsItem } | null>(null);
  useEffect(() => {
    if (!story) return;
    const previous = shownRef.current;
    shownRef.current = { index, item: story };
    if (!previous || previous.item.id === story.id || reduced) return;
    setLeaving({ item: previous.item, direction: turnDirection(previous.index, index, count) });
  }, [index, story, count, reduced]);

  const turn = (by: number) => setOffset((current) => current + by);
  const turnTo = (target: number) => setOffset((current) => current + (target - index));
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (count <= 1) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      turn(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      turn(1);
    }
  };
  if (!story) return null;

  // Forward, the arriving story is already the page and the leaving one is
  // lifted off it; back, the leaving story stays the page until the arriving
  // one has been laid down on it.
  const layingDown = leaving?.direction === 'back';
  const page = layingDown && leaving ? leaving.item : story;
  const lifted = layingDown ? story : leaving?.item;
  const settle = () => setLeaving(null);
  const liftStyle = { '--paper-lift-ms': `${TURN_MS}ms` } as CSSProperties;
  return (
    <section
      className="paper-edition"
      aria-label="The edition"
      onMouseEnter={() => engageable && setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => engageable && setEngaged(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEngaged(false);
      }}
      onTouchStart={() => setEngaged(true)}
      onKeyDown={onKey}
    >
      <div className="paper-kicker-row">
        <div className="paper-kicker-group">
          <p className="paper-kicker">{kicker(story)}</p>
          <SourceTag item={story} sources={sources} />
        </div>
        {count > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="paper-turn"
              aria-label="Previous story"
              onClick={() => turn(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="paper-counter" aria-live="polite">
              {counterLine(index, count)}
            </span>
            <button
              type="button"
              className="paper-turn"
              aria-label="Next story"
              onClick={() => turn(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="paper-sheet-stage">
        <div key={page.id} className="paper-sheet" aria-live="polite">
          <Story item={page} mark={mark} now={now} />
        </div>
        {leaving && lifted && (
          <div
            key={`${leaving.direction}-${lifted.id}`}
            className="paper-sheet-lift"
            data-direction={leaving.direction}
            style={liftStyle}
            aria-hidden
            onAnimationEnd={settle}
          >
            <Story item={lifted} mark={mark} now={now} />
          </div>
        )}
      </div>
      <Inside stories={stories} current={index} sources={sources} onTurnTo={turnTo} />
    </section>
  );
}
