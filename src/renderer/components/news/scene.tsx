// The story's picture: the scene painted in the page's ink on a canvas, the
// persona duck standing in it in colour, and a caption under the frame. The
// canvas repaints when the theme or the world changes, so the ink and the
// accent are always the page's own.

import { useEffect, useRef } from 'react';
import { StoryDuck } from './story-duck';
import type { MarkKind } from '@/lib/news/persona';
import { CELL, FRAME } from '@/lib/news/scenes/alphabet';
import { paintScene } from '@/lib/news/scenes/paint';
import { SCENES, buildScene, type SceneId } from '@/lib/news/scenes/scenes';
import { onPaletteChange, readPalette } from '@/lib/screensaver/palette';
import type { PersonaId } from '@/lib/yeaboi/personas';

/** The sprite's height in CSS pixels; the stand is where its feet go. */
const SPRITE_H = 136;

export function Scene({ id, persona, mark }: { id: SceneId; persona: PersonaId; mark: MarkKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = SCENES[id];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () =>
      paintScene(canvas, buildScene(id), readPalette(), window.devicePixelRatio || 1);
    paint();
    return onPaletteChange(paint);
  }, [id]);

  return (
    <figure className="paper-figure">
      <div className="paper-frame">
        <canvas
          ref={ref}
          className="paper-scene"
          width={FRAME.w * CELL}
          height={FRAME.h * CELL}
          aria-hidden
        />
        <div
          className="paper-stand"
          style={{ left: scene.stand.x * CELL, top: scene.stand.y * CELL - SPRITE_H }}
        >
          <StoryDuck persona={persona} mark={mark} />
        </div>
      </div>
      <figcaption className="paper-caption">{scene.caption}</figcaption>
    </figure>
  );
}
