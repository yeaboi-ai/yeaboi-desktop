'use client';

// Hold the radio back for as long as `active` is true — a live call, a voice
// session. The cleanup releases the claim even if the component unmounts mid-call.

import { useEffect } from 'react';
import { holdMusic } from '@/lib/music/hold';

export function useMusicHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return holdMusic();
  }, [active]);
}
