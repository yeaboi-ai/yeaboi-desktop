'use client';

// The duck's preferences, read from and written to the main process.
//
// Local state leads and the write is debounced, so dragging a size slider
// resizes the duck on screen continuously without a settings-file write per
// frame. Main is still the authority: it clamps whatever arrives and returns
// the prefs it actually stored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { type PetPrefs, PET_DEFAULTS, mergePetPrefs } from '@shared/pet-prefs';
import { setNotifyPrefs } from '@/lib/duck-events';
import { logger } from '@/lib/logger';

const SAVE_DEBOUNCE_MS = 200;

export function usePetPrefs() {
  const [prefs, setPrefs] = useState<PetPrefs>(PET_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<PetPrefs>>({});

  useEffect(() => {
    window.yeaboi
      .getPetPrefs()
      .then((stored) => {
        const next = mergePetPrefs(PET_DEFAULTS, stored);
        setPrefs(next);
        setNotifyPrefs(next);
      })
      .catch(() => logger.warn('Failed to read duck preferences'))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((patch: Partial<PetPrefs>) => {
    setPrefs((current) => {
      const next = mergePetPrefs(current, patch);
      setNotifyPrefs(next);
      return next;
    });
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const patchToSend = pending.current;
      pending.current = {};
      window.yeaboi
        .setPetPrefs(patchToSend)
        .catch(() => logger.warn('Failed to save duck preferences'));
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const reset = useCallback(() => update(PET_DEFAULTS), [update]);

  return { prefs, loading, update, reset };
}
