'use client';

// The idle screensaver: mounted once, covers the window, gets out of the way.
//
// Mounted in Providers beside DuckChrome and AmbienceHost, and inside
// ThemeProvider — which is what lets the scenes read the active theme's tokens
// off <html> and belong to whatever palette the window is wearing.
//
// The threshold and the chosen style come from GET /api/ambience, the same
// preference the terminal reads, so a screensaver turned off in one place is
// off in the other. Neither is required: with no backend the app still gets its
// default saver rather than nothing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { getAmbience } from '@/lib/yeaboi/ambience';
import { IdleController, DEFAULT_IDLE_SECONDS } from '@/lib/screensaver/idle';
import { onPreviewRequest } from '@/lib/screensaver/preview';
import { isSuppressed, onSuppressionChange } from '@/lib/screensaver/suppression';
import { DEFAULT_SAVER_STYLE, resolveScene, type SceneStyle } from '@/lib/screensaver/styles';
import { ScreensaverCanvas } from './screensaver-canvas';

/** How often idleness is re-checked. Coarse on purpose — this is a 5-minute clock. */
const TICK_MS = 1000;

/** Events that count as a person being here. */
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus'] as const;

export function ScreensaverHost() {
  const backend = useYeaboiBackend();
  const reduced = useReducedMotion();
  const [showing, setShowing] = useState(false);
  const [scene, setScene] = useState<SceneStyle>(DEFAULT_SAVER_STYLE);
  const controllerRef = useRef(new IdleController(DEFAULT_IDLE_SECONDS, performance.now()));
  // Read inside listeners that must not be re-bound on every preference change.
  const preferenceRef = useRef<string>(DEFAULT_SAVER_STYLE);

  const wake = useCallback(() => {
    const controller = controllerRef.current;
    if (controller.noteActivity(performance.now())) setShowing(false);
  }, []);

  const activate = useCallback(() => {
    const controller = controllerRef.current;
    if (preferenceRef.current === 'off') return;
    if (!controller.showNow(performance.now())) return;
    setScene(resolveScene(preferenceRef.current, Math.random));
    setShowing(true);
  }, []);

  // The preference, once the backend is up. Until then the defaults stand.
  useEffect(() => {
    if (backend.kind !== 'ready') return;
    let cancelled = false;
    getAmbience().then(
      (state) => {
        if (cancelled || !state.saver) return;
        preferenceRef.current = state.saver.style ?? DEFAULT_SAVER_STYLE;
        controllerRef.current.idleSeconds = state.saver.idle_seconds || DEFAULT_IDLE_SECONDS;
        if (preferenceRef.current === 'off') setShowing(false);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [backend.kind]);

  // Activity. Capture-phase and passive: this only ever observes.
  useEffect(() => {
    for (const type of ACTIVITY) {
      window.addEventListener(type, wake, { capture: true, passive: true });
    }
    return () => {
      for (const type of ACTIVITY) window.removeEventListener(type, wake, { capture: true });
    };
  }, [wake]);

  // The hidden preview shortcut, matching the terminal's Ctrl+Y.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 'y' || event.metaKey || event.altKey)
        return;
      event.preventDefault();
      // The wake listener above has already run and cleared the idle clock, so
      // this reads as a deliberate request rather than as activity.
      activate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate]);

  // The Preview button on the Appearance tab.
  useEffect(() => onPreviewRequest(activate), [activate]);

  // The idle clock.
  useEffect(() => {
    const controller = controllerRef.current;
    const stopWatchingSuppression = onSuppressionChange((suppressed) => {
      if (suppressed) {
        controller.pushSuppression();
        setShowing(false);
      } else {
        controller.popSuppression(performance.now());
      }
    });
    if (isSuppressed()) controller.pushSuppression();

    const timer = window.setInterval(() => {
      if (preferenceRef.current === 'off') {
        if (controller.showing) setShowing(false);
        return;
      }
      const wasShowing = controller.showing;
      if (controller.shouldShow(performance.now()) && !wasShowing) {
        setScene(resolveScene(preferenceRef.current, Math.random));
        setShowing(true);
      } else if (!controller.showing && wasShowing) {
        setShowing(false);
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      stopWatchingSuppression();
    };
  }, []);

  if (!showing) return null;

  return (
    <div
      // The event that dismisses the saver must not also act on whatever is
      // underneath it. The overlay is what swallows it: the capture-phase wake
      // listener has already fired by the time these run, so stopping the event
      // here costs nothing and saves a stray click.
      onPointerDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        wake();
      }}
      onKeyDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        wake();
      }}
      className="fixed inset-0 z-[9998] cursor-none bg-background"
      data-screensaver={scene}
    >
      <ScreensaverCanvas style={scene} still={reduced} className="h-full w-full" />
    </div>
  );
}
