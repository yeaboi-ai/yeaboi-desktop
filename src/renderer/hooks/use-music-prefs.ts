'use client';

// The music preferences, read from and written to the main process.
//
// Local state leads and the write is debounced, so the volume slider moves the
// sound continuously without a settings-file write per frame. Main is still the
// authority: it clamps whatever arrives and returns what it actually stored.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type MusicPrefs,
  type SavedLink,
  MUSIC_DEFAULTS,
  mergeMusicPrefs,
  newSavedLinkId,
} from '@shared/music';
import { parseMusicLink } from '@shared/music-links';
import { logger } from '@/lib/logger';

const SAVE_DEBOUNCE_MS = 200;

export function useMusicPrefs() {
  const [prefs, setPrefs] = useState<MusicPrefs>(MUSIC_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<MusicPrefs>>({});
  // The shelf as last decided here, so two quick adds see each other and the
  // duplicate answer is settled before React runs any updater.
  const libraryRef = useRef<SavedLink[]>(MUSIC_DEFAULTS.library);
  libraryRef.current = prefs.library;

  useEffect(() => {
    window.yeaboi
      .getMusicPrefs()
      .then((stored) => setPrefs(mergeMusicPrefs(MUSIC_DEFAULTS, stored)))
      .catch(() => logger.warn('Failed to read music preferences'))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((patch: Partial<MusicPrefs>) => {
    setPrefs((current) => mergeMusicPrefs(current, patch));
    // The visualiser block merges a level deep, here and in main, so a partial
    // patch of it keeps what an earlier one in the same debounce set.
    const visualizer =
      patch.visualizer || pending.current.visualizer
        ? ({ ...pending.current.visualizer, ...patch.visualizer } as MusicPrefs['visualizer'])
        : undefined;
    pending.current = { ...pending.current, ...patch, ...(visualizer ? { visualizer } : {}) };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const patchToSend = pending.current;
      pending.current = {};
      window.yeaboi
        .setMusicPrefs(patchToSend)
        .catch(() => logger.warn('Failed to save music preferences'));
    }, SAVE_DEBOUNCE_MS);
  }, []);

  /** Add a pasted link to the shelf. Returns the row, or null for a link the
   *  grammar refuses (the caller shows the error; nothing is saved). */
  const addLink = useCallback(
    (url: string, label?: string): SavedLink | null => {
      const link = parseMusicLink(url);
      if (!link) return null;
      const row: SavedLink = {
        id: newSavedLinkId(),
        service: link.service,
        kind: link.kind,
        label: (label ?? '').trim() || link.label,
        url: url.trim(),
        addedAt: Date.now(),
      };
      if (libraryRef.current.some((item) => item.url === row.url)) return null;
      const next = mergeMusicPrefs(
        { ...prefs, library: libraryRef.current },
        {
          library: [...libraryRef.current, row],
        },
      );
      libraryRef.current = next.library;
      pending.current = { ...pending.current, library: next.library };
      setPrefs((current) => ({ ...current, library: next.library }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const patchToSend = pending.current;
        pending.current = {};
        window.yeaboi
          .setMusicPrefs(patchToSend)
          .catch(() => logger.warn('Failed to save music preferences'));
      }, SAVE_DEBOUNCE_MS);
      return row;
    },
    [prefs],
  );

  const removeLink = useCallback(
    (id: string) => {
      const library = libraryRef.current.filter((item) => item.id !== id);
      libraryRef.current = library;
      pending.current = { ...pending.current, library };
      setPrefs((current) => ({ ...current, library }));
      update({});
    },
    [update],
  );

  return { prefs, loading, update, addLink, removeLink };
}
