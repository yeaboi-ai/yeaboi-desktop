'use client';

// A remembered "read it" flag in localStorage, shared across tabs. The same
// gate coach-marks.tsx keeps to itself, as a hook any dismissible hint can use.

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const SEEN = '1';

function changeEvent(key: string): string {
  return `seen-flag-change:${key}`;
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === SEEN;
  } catch {
    return false;
  }
}

function subscribe(key: string) {
  return (callback: () => void) => {
    const handler = (e: StorageEvent | Event) => {
      if (e instanceof StorageEvent && e.key && e.key !== key) return;
      callback();
    };
    window.addEventListener(changeEvent(key), handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(changeEvent(key), handler);
      window.removeEventListener('storage', handler);
    };
  };
}

export function useSeenFlag(key: string): [boolean, (seen: boolean) => void] {
  const subscribeToKey = useMemo(() => subscribe(key), [key]);
  const seen = useSyncExternalStore(
    subscribeToKey,
    () => read(key),
    () => true,
  );
  const setSeen = useCallback(
    (value: boolean) => {
      try {
        if (value) window.localStorage.setItem(key, SEEN);
        else window.localStorage.removeItem(key);
      } catch {
        // Storage blocked: the flag lives for this render only.
      }
      window.dispatchEvent(new Event(changeEvent(key)));
    },
    [key],
  );
  return [seen, setSeen];
}
