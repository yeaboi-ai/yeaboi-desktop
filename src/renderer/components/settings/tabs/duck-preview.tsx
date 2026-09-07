'use client';

// The duck, inside the app, while his settings are open: the size, colour, sit
// height and gait being edited, on something that walks about rather than a
// picture of him.
//
// He gets a floor of his own at the foot of the page rather than being laid
// over it — a duck crossing the sliders being changed is a duck in the way.

import { useEffect, useState } from 'react';
import type { PetPrefs } from '@shared/pet-prefs';
import { DuckSprite } from './duck-sprite';

/** The rig width the pet window draws at scale 1. */
const BASE_WIDTH = 72;
/** One length of the walk, in seconds. Slow: he is being looked at. */
const WALK_S = 22;

export function DuckPreview({ prefs }: { prefs: PetPrefs }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const arrive = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(arrive);
  }, []);

  const width = BASE_WIDTH * prefs.scale;

  return (
    <div aria-hidden="true" className="xl:col-span-2">
      <div
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
              '--duck-walk-s': `${WALK_S}s`,
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
