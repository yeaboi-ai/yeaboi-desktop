'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'planr-captions-on';
const EVENT = 'planr-captions-change';

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

/** Reactive, persisted captions-overlay toggle. Default off. */
export function useCaptionsPreference(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((next: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [enabled, update];
}
