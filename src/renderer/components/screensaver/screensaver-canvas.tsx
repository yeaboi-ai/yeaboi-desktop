'use client';

// One canvas running one scene. Shared by the full-window saver and the little
// preview tiles on the Appearance tab, so what a person picks by is the same
// code that later covers their window.
//
// Everything expensive is kept out of React: the scene lives in a ref and the
// rAF loop mutates it, so a frame never costs a render. React is only told
// about the things that actually change identity — the style, the palette, the
// element's size.

import { useEffect, useRef } from 'react';
import { duckArtNow, loadDuckArt, loadWardrobe, wardrobeNow } from '@/lib/screensaver/duck-art';
import { dressed, readPersonaChoice } from '@/lib/screensaver/persona';
import { readPalette, onPaletteChange, type Palette } from '@/lib/screensaver/palette';
import { seeded, type Scene } from '@/lib/screensaver/scene';
import { createScene } from '@/lib/screensaver/scenes';
import type { SceneStyle } from '@/lib/screensaver/styles';
import { DEFAULT_PERSONA, type PersonaChoice } from '@shared/personas';

/** Retina is worth paying for; a 3x display is not, for a background animation. */
const MAX_DPR = 2;

export function ScreensaverCanvas({
  style,
  still = false,
  seed,
  className,
}: {
  style: SceneStyle;
  /** Paint a single frame instead of animating (reduced motion, or a still tile). */
  still?: boolean;
  /** Fixed seed for a preview tile, so it looks the same every time it mounts. */
  seed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const paletteRef = useRef<Palette | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let last = performance.now();
    let disposed = false;
    let width = 0;
    let height = 0;
    let choice: PersonaChoice = DEFAULT_PERSONA;

    const fit = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Draw in CSS pixels; the transform absorbs the device ratio, so no scene
      // has to know anything about displays.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneRef.current?.resize(width, height);
    };

    const build = (): void => {
      paletteRef.current = readPalette();
      const scene = createScene(style, {
        width,
        height,
        palette: paletteRef.current,
        random: seeded(seed ?? Math.floor(Math.random() * 0xffffffff)),
        still,
      });
      const art = duckArtNow();
      const wardrobe = wardrobeNow();
      if (art && wardrobe) dressed(scene, art, wardrobe, choice);
      else if (art) scene.setArt(art);
      sceneRef.current = scene;
    };

    fit();
    build();

    // Every scene draws the duck, so the art is always wanted. A scene renders
    // without it until it lands rather than holding a blank frame. The
    // wardrobe and the persona choice follow: bare until then.
    void loadDuckArt().then((art) => {
      if (disposed) return;
      sceneRef.current?.setArt(art);
      if (still) sceneRef.current?.draw(ctx);
    });
    void Promise.all([loadDuckArt(), loadWardrobe(), readPersonaChoice()]).then(
      ([art, wardrobe, stored]) => {
        if (disposed) return;
        choice = stored;
        const scene = sceneRef.current;
        if (scene) dressed(scene, art, wardrobe, choice);
        if (still) sceneRef.current?.draw(ctx);
      },
    );

    const paint = (now: number): void => {
      const scene = sceneRef.current;
      if (!scene) return;
      // Clamp the delta: a tab that was hidden for an hour must not try to
      // simulate an hour on the frame it comes back.
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      scene.step(dt);
      scene.draw(ctx);
      if (!still) frame = requestAnimationFrame(paint);
    };

    if (still) {
      // One frame, then nothing. Under reduced motion the saver still covers
      // the window — it just holds a pose, the way the Duck primitive does.
      sceneRef.current?.draw(ctx);
    } else {
      frame = requestAnimationFrame(paint);
    }

    const observer = new ResizeObserver(() => {
      fit();
      if (still) sceneRef.current?.draw(ctx);
    });
    observer.observe(canvas);

    const stopWatchingTheme = onPaletteChange(() => {
      const palette = readPalette();
      paletteRef.current = palette;
      sceneRef.current?.repalette(palette);
      if (still) sceneRef.current?.draw(ctx);
    });

    // A screensaver that keeps the GPU busy behind another window is a battery
    // bug, so the loop stops the moment the window is hidden and picks up from
    // "now" when it comes back rather than replaying the gap.
    const onVisibility = (): void => {
      if (still) return;
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(paint);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      stopWatchingTheme();
      document.removeEventListener('visibilitychange', onVisibility);
      sceneRef.current = null;
    };
  }, [style, still, seed]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
