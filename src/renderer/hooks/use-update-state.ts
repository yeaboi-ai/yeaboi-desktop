'use client';

// The shell updater's state, as a hook. Pull once on mount (an update may have
// been found before this window subscribed), then follow the push half — the
// same shape as use-yeaboi-backend. useUpdateFlow adds the one-click contract:
// Update downloads and, once ready, restarts after a short visible countdown.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadUpdate,
  getUpdateState,
  installUpdate,
  onUpdateState,
  type UpdateState,
} from '@/lib/yeaboi/api';

const DISMISSED_KEY = 'update.dismissed-version';
const DISMISSED_EVENT = 'update-dismissed-change';
/** TUI parity: Ctrl+U restarts after a 3-second countdown. */
const RESTART_COUNTDOWN_SECONDS = 3;

export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  useEffect(() => {
    let mounted = true;
    void getUpdateState().then((current) => {
      if (mounted) setState(current);
    });
    onUpdateState((next) => {
      if (mounted) setState(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

export interface UpdateFlow {
  state: UpdateState;
  /** The one click: download, then restart when the download lands. On an
   *  already-downloaded update it restarts immediately. */
  update: () => void;
  /** Hide the passive chrome for the currently offered version. */
  dismiss: () => void;
  dismissedVersion: string | null;
  /** Seconds left before the flow restarts the app; null outside the countdown. */
  countdown: number | null;
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function useUpdateFlow(): UpdateFlow {
  const state = useUpdateState();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(readDismissed);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Set by update() so a tray-initiated download does not auto-restart: only
  // a click on this window's own button earns the countdown.
  const installWhenReady = useRef(false);

  useEffect(() => {
    const sync = () => setDismissedVersion(readDismissed());
    window.addEventListener('storage', sync);
    window.addEventListener(DISMISSED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(DISMISSED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready' || !installWhenReady.current) return;
    installWhenReady.current = false;
    setCountdown(RESTART_COUNTDOWN_SECONDS);
  }, [state.kind]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void installUpdate();
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const update = useCallback(() => {
    if (state.kind === 'ready') {
      void installUpdate();
    } else if (state.kind === 'available') {
      installWhenReady.current = true;
      void downloadUpdate();
    }
  }, [state.kind]);

  const dismiss = useCallback(() => {
    if (state.kind !== 'available') return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, state.version);
    } catch {
      // Private-mode storage failures just make the card reappear next launch.
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  }, [state]);

  return { state, update, dismiss, dismissedVersion, countdown };
}
