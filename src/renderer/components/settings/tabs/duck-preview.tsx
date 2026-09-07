'use client';

// The duck, inside the app, while his settings are open: the size, colour, sit
// height and gait being edited, on something that walks about rather than a
// picture of him.
//
// He gets a floor of his own at the foot of the page rather than being laid
// over it — a duck crossing the sliders being changed is a duck in the way.

import { useEffect, useRef, useState } from 'react';
import type { PetPrefs } from '@shared/pet-prefs';
import { DuckSprite } from './duck-sprite';

/** The rig width the pet window draws at scale 1. */
const BASE_WIDTH = 72;
/** How fast he walks: pet.js BASE.walkSpeed, 0.9px a frame at 60fps, scaled
 *  with him. The strip's length then decides how long a crossing takes. */
const PX_PER_SECOND = 0.9 * 60;

export function DuckPreview({ prefs }: { prefs: PetPrefs }) {
  const [shown, setShown] = useState(false);
  const floor = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(0);
  useEffect(() => {
    const arrive = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(arrive);
  }, []);

  // The walk is a CSS animation over the strip's own width, so its duration
  // has to be measured rather than guessed: a fixed one walks a wide window
  // at a sprint and a narrow one at a crawl.
  useEffect(() => {
    const el = floor.current;
    if (!el) return;
    const measure = () => setSpan(el.clientWidth);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const width = BASE_WIDTH * prefs.scale;
  const seconds = Math.max(8, (2 * Math.max(0, span - width)) / (PX_PER_SECOND * prefs.scale));

  return (
    <div aria-hidden="true" className="xl:col-span-2">
      <div
        ref={floor}
        className="relative border-b border-border/50 transition-opacity duration-500 ease-out"
        style={{ height: width + prefs.raise + 8, opacity: shown ? 1 : 0 }}
      >
        <div
          className={prefs.walk ? 'duck-walk absolute' : 'absolute left-1/2'}
          style={
            {
              width,
              bottom: prefs.raise,
              '--duck-w': `${width}px`,
              '--duck-walk-s': `${seconds}s`,
            } as React.CSSProperties
          }
        >
          <DuckSprite
            width={width}
            walking={prefs.walk}
            filter={`hue-rotate(${prefs.hue}deg) saturate(${prefs.vividness})`}
          />
        </div>
      </div>
    </div>
  );
}
