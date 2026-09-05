// A story's duck, where the photograph would be: the layered sprite as a DOM
// rig that bobs as one.
//
// PersonaDuckMark lays a hat over the design package's Duck, whose body bobs
// on its own; at mark sizes the bob is under a pixel and the hat sits still.
// At this size it is five pixels, and the hat would float. So every
// layer lives inside one bobbing element here, the wing and the glasses with
// their own small loops, the way the desktop pet is rigged.

import type { MarkKind } from '@/lib/news/persona';
import { DUCK_SRC, OUTFIT_HEADROOM, PERSONA_SRC, ROBO_SRC } from '@/lib/screensaver/duck-art';
import type { PersonaId } from '@/lib/yeaboi/personas';

/** The sprite's canvas in source pixels; the personas add OUTFIT_HEADROOM above it. */
const SPRITE_W = 128;
const SPRITE_H = 136;

export function StoryDuck({
  persona,
  mark,
  size = 128,
}: {
  persona: PersonaId;
  mark: MarkKind;
  size?: number;
}) {
  const rise = (OUTFIT_HEADROOM / SPRITE_W) * size;
  const height = (SPRITE_H / SPRITE_W) * size;
  const layers = PERSONA_SRC[persona];
  return (
    <span className="paper-duck" style={{ width: size, height }} aria-hidden>
      <span className="paper-duck-body">
        {mark === 'robo' ? (
          <img src={ROBO_SRC[persona]} alt="" draggable={false} style={{ marginTop: -rise }} />
        ) : (
          <>
            <img src={DUCK_SRC.base} alt="" draggable={false} />
            {layers
              .filter((layer) => layer.slot === 'body')
              .map((layer) => (
                <img
                  key={layer.src}
                  className="paper-duck-layer"
                  src={layer.src}
                  alt=""
                  draggable={false}
                  style={{ top: -rise }}
                />
              ))}
            <img
              className="paper-duck-layer paper-duck-wing"
              src={DUCK_SRC.wing}
              alt=""
              draggable={false}
            />
            <img
              className="paper-duck-layer paper-duck-glasses"
              src={DUCK_SRC.glasses}
              alt=""
              draggable={false}
            />
            {layers
              .filter((layer) => layer.slot === 'top')
              .map((layer) => (
                <img
                  key={layer.src}
                  className="paper-duck-layer"
                  src={layer.src}
                  alt=""
                  draggable={false}
                  style={{ top: -rise }}
                />
              ))}
          </>
        )}
      </span>
    </span>
  );
}
