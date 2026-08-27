"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "planr-reduced-color";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  // Listen for cross-tab changes...
  window.addEventListener("storage", callback);
  // ...and same-tab changes (storage events don't fire in the originating tab).
  window.addEventListener("planr-reduced-color-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("planr-reduced-color-change", callback);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the user prefers a colorblind-safe transcript palette.
 * Persisted in localStorage. Settings UI flips this; transcript reads it.
 */
export function useReducedColor(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: boolean) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event("planr-reduced-color-change"));
  }, []);

  return [enabled, update];
}
