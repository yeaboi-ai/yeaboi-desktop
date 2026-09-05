'use client';

// The space on the Music page the embed frame is laid over. Empty on its own:
// the frame belongs to EmbedHost at the window's root, and only borrows this
// rectangle while the page shows it.

import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '@/components/providers/music-provider';

export const EMBED_HEIGHT = 352;

export function EmbedSlot() {
  const { registerEmbedSlot } = useMusicPlayer();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    registerEmbedSlot(ref.current);
    return () => registerEmbedSlot(null);
  }, [registerEmbedSlot]);
  return (
    <div
      ref={ref}
      data-embed-slot
      aria-hidden
      style={{ height: EMBED_HEIGHT }}
      className="w-full rounded-xl bg-secondary/40"
    />
  );
}
