'use client';

// The duck, in the app, while his settings are open — the real one: the pet
// window's own page in an iframe along the foot of the window, with the bridge
// it expects stubbed out (public/pet/preview.html). Everything he does on the
// desktop he does here, because it is the same code: the walk, the gait, the
// dodge, and being picked up and thrown.
//
// The strip only takes the pointer while he is under it. pet.js already says
// when that is — it calls setInteractive as the cursor crosses his hitbox — so
// the parent feeds it the cursor and toggles the iframe's pointer-events on
// what it answers, which is what the pet window does with its own.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PetPrefs } from '@shared/pet-prefs';

/** How much of the window's foot he gets: room to be thrown, and to stand at
 *  200% without his head meeting the ceiling. The strip is transparent to the
 *  pointer except where he is, so its size costs the page nothing. */
const STRIP = 'clamp(320px, 45vh, 560px)';

export function DuckPreview({ prefs }: { prefs: PetPrefs }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    const arrive = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(arrive);
  }, []);

  // What the page says back: whether the cursor is on him.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { pet?: string; over?: boolean };
      if (data?.pet === 'interactive') setOver(Boolean(data.over));
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  const post = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');

  // A floor at the foot of the strip and no dock to climb.
  useEffect(() => {
    if (!ready) return;
    post({ pet: 'config', config: { bottomInset: 0, dock: { present: false } } });
  }, [ready]);

  useEffect(() => {
    if (ready) post({ pet: 'prefs', prefs });
  }, [ready, prefs]);

  // The cursor feed the main process gives the pet window, in strip coordinates.
  useEffect(() => {
    if (!ready) return;
    const feed = (event: PointerEvent) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      post({ pet: 'cursor', point: { x: event.clientX - box.left, y: event.clientY - box.top } });
    };
    window.addEventListener('pointermove', feed);
    return () => window.removeEventListener('pointermove', feed);
  }, [ready]);

  if (!mounted) return null;

  return createPortal(
    <iframe
      ref={frame}
      src="/pet/preview.html"
      title="Duck preview"
      // Over the page's own bottom fade (z-30), which washes him out from under
      // it, and under the toasts.
      onLoad={() => setReady(true)}
      className="fixed inset-x-0 bottom-0 z-[120] w-full border-0 bg-transparent transition-opacity duration-500 ease-out"
      style={{ height: STRIP, pointerEvents: over ? 'auto' : 'none', opacity: shown ? 1 : 0 }}
    />,
    document.body,
  );
}
