'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'planr-ptt-enabled';
const EVENT = 'planr-ptt-change';

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

/** Reactive, persisted PTT-enabled preference. Default off. */
export function usePushToTalkPreference(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((next: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [enabled, update];
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

interface PushToTalkOptions {
  /** Whether PTT mode is currently enabled. When false, the hook is a no-op. */
  enabled: boolean;
  /** Whether the call is active. PTT does nothing outside an active call. */
  active: boolean;
  /** Setter for the global mic-muted state. */
  setMicMuted: (muted: boolean) => void;
}

/**
 * Push-to-talk: hold Space to unmute, release to re-mute.
 *
 * - Suppressed while focus is in any input/textarea/contenteditable so typing
 *   never triggers transmission.
 * - Suppressed when `enabled` is false or `active` is false.
 * - Idempotent on repeated keydowns (key auto-repeat).
 *
 * Mic stays muted by default when PTT is on; only unmutes during the press.
 */
export function usePushToTalk({ enabled, active, setMicMuted }: PushToTalkOptions): void {
  useEffect(() => {
    if (!enabled || !active) return;

    // While PTT mode is on and call is active, default to muted.
    setMicMuted(true);

    let pressed = false;

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isInputTarget(e.target)) return;
      if (pressed) return; // ignore key auto-repeat
      pressed = true;
      e.preventDefault();
      setMicMuted(false);
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!pressed) return;
      pressed = false;
      e.preventDefault();
      setMicMuted(true);
    };

    // Window blur — if user tabs away while holding, force back to muted.
    const onBlur = () => {
      if (pressed) {
        pressed = false;
        setMicMuted(true);
      }
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, active, setMicMuted]);
}
