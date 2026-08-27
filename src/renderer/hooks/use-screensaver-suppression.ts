'use client';

// Hold the screensaver back for as long as `active` is true.
//
// Pages and hooks do not reach into the suppression refcount directly; they say
// "I am busy" and the effect's cleanup releases the claim even if the component
// unmounts mid-run.

import { useEffect } from 'react';
import { suppressScreensaver } from '@/lib/screensaver/suppression';

export function useScreensaverSuppression(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return suppressScreensaver();
  }, [active]);
}
