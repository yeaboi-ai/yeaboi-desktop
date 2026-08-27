'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'planr-plain-language';
const EVENT = 'planr-plain-language-change';

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the user prefers plain-language copy over jargon
 * (e.g. "Helps the meeting" instead of "Facilitator").
 */
export function usePlainLanguage(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [enabled, update];
}
