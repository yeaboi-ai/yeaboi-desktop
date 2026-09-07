'use client';

// The duck, inside the app, while his settings are open: the size, colour, sit
// height and gait being edited, on something that walks about rather than a
// picture of him. He fades in when the page opens and leaves with it.

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
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-10 transition-opacity duration-500 ease-out"
      style={{
        bottom: `calc(var(--dock-clear, 4rem) + ${prefs.raise}px)`,
        opacity: shown ? 1 : 0,
      }}
    >
      <div className="relative mx-auto max-w-[1360px] px-6" style={{ height: width }}>
        <div
          className={prefs.walk ? 'duck-walk absolute bottom-0' : 'absolute bottom-0 left-1/2'}
          style={
            {
              width,
              '--duck-w': `${width}px`,
              '--duck-walk-s': `${WALK_S}s`,
            } as React.CSSProperties
          }
        >
          <div className="duck-bob">
            <DuckSprite
              width={width}
              filter={`hue-rotate(${prefs.hue}deg) saturate(${prefs.vividness})`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
