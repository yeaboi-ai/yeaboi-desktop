'use client';

// The pond on the home: one canvas running the pond scene, sized by its box.
// The same loop discipline as the screensaver canvas — the scene lives in a
// ref and rAF mutates it, so a frame never costs a render; the loop stops when
// the window is hidden; a theme or world change repaints from the tokens.
//
// The canvas is decoration with a click: the two words remain the accessible
// doors, and this only lets the pointer reach for a lobe. The diptych drives
// it through the handle so hovering a word or a list pulls the duck too.

import { forwardRef, useEffect, useImperativeHandle, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAudience } from '@/components/providers/audience-provider';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { DIVE_SECONDS, createPondScene, type PondScene, type Side } from '@/lib/home/pond-scene';
import { duckArtNow, loadDuckArt, loadRoboArt, roboArtNow } from '@/lib/screensaver/duck-art';
import { onPaletteChange, readPalette } from '@/lib/screensaver/palette';
import { seeded } from '@/lib/screensaver/scene';

const MAX_DPR = 2;

export interface PondHandle {
  lean(side: Side | null): void;
  dive(side: Side): void;
}

export const Pond = forwardRef<
  PondHandle,
  {
    /** Where each lobe opens. */
    hrefs: Record<Side, string>;
    className?: string;
  }
>(function Pond({ hrefs, className }, ref) {
  const { audience } = useAudience();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<PondScene | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const audienceRef = useRef(audience);
  const hrefsRef = useRef(hrefs);
  hrefsRef.current = hrefs;

  const repaintIfStill = (): void => {
    if (reduced && ctxRef.current && sceneRef.current) sceneRef.current.draw(ctxRef.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    let frame = 0;
    let last = performance.now();
    let disposed = false;
    let width = 0;
    let height = 0;

    const fit = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneRef.current?.resize(width, height);
    };

    fit();
    const scene = createPondScene({
      width,
      height,
      palette: readPalette(),
      random: seeded(Math.floor(Math.random() * 0xffffffff)),
      still: reduced,
      world: audienceRef.current,
    });
    const art = duckArtNow();
    if (art) scene.setArt(art);
    scene.setMark(roboArtNow());
    sceneRef.current = scene;

    void loadDuckArt().then((loaded) => {
      if (disposed) return;
      scene.setArt(loaded);
      if (reduced) scene.draw(ctx);
    });
    void loadRoboArt().then((loaded) => {
      if (disposed) return;
      scene.setMark(loaded);
      if (reduced) scene.draw(ctx);
    });

    const paint = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      scene.step(dt);
      scene.draw(ctx);
      if (!reduced) frame = requestAnimationFrame(paint);
    };

    if (reduced) scene.draw(ctx);
    else frame = requestAnimationFrame(paint);

    const observer = new ResizeObserver(() => {
      fit();
      if (reduced) scene.draw(ctx);
    });
    observer.observe(canvas);

    const stopWatchingTheme = onPaletteChange(() => {
      scene.repalette(readPalette());
      if (reduced) scene.draw(ctx);
    });

    const onVisibility = (): void => {
      if (reduced) return;
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
      ctxRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    audienceRef.current = audience;
    sceneRef.current?.setWorld(audience);
    repaintIfStill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  const lean = (side: Side | null): void => {
    sceneRef.current?.lean(side);
    repaintIfStill();
  };

  const dive = (side: Side): void => {
    sceneRef.current?.dive(side);
    const href = hrefsRef.current[side];
    if (reduced) navigate(href);
    else window.setTimeout(() => navigate(href), DIVE_SECONDS * 1000);
  };

  useImperativeHandle(ref, () => ({ lean, dive }));

  const sideOf = (event: MouseEvent<HTMLCanvasElement>): Side | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    return sceneRef.current?.sideAt(event.clientX - rect.left, event.clientY - rect.top) ?? null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      onPointerMove={(event) => {
        const side = sideOf(event);
        event.currentTarget.style.cursor = side ? 'pointer' : '';
        lean(side);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.cursor = '';
        lean(null);
      }}
      onClick={(event) => {
        const side = sideOf(event);
        if (side) dive(side);
      }}
    />
  );
});
