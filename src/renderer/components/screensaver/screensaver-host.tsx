'use client';

// The idle screensaver: mounted once, covers the window, gets out of the way.
//
// Mounted in Providers beside AmbienceHost, and inside
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
import { onPreviewRequest, onSaverPreferenceChange } from '@/lib/screensaver/preview';
import { isSuppressed, onSuppressionChange } from '@/lib/screensaver/suppression';
import {
  DEFAULT_SAVER_STYLE,
  type DrawableStyle,
  isDomStyle,
  resolveScene,
} from '@/lib/screensaver/styles';
import { isModifierKey, reachInput, reachStep } from '@/lib/screensaver/reach';
import { cn } from '@/lib/utils';
import { ReachHint } from './reach-hint';
import { ScreensaverCanvas } from './screensaver-canvas';
import { ScreensaverScene } from './screensaver-scene';

/** How often idleness is re-checked. Coarse on purpose — this is a 5-minute clock. */
const TICK_MS = 1000;

/** Events that count as a person being here. */
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus'] as const;

/** Bound alongside ACTIVITY because a reach must not outlive the key holding
 *  it. Not activity: a release is the end of something, not the start. */
const REACH_ONLY = ['keyup'] as const;

export function ScreensaverHost() {
  const backend = useYeaboiBackend();
  const reduced = useReducedMotion();
  const [showing, setShowing] = useState(false);
  const [scene, setScene] = useState<DrawableStyle>(DEFAULT_SAVER_STYLE);
  // The modifier is held and the paper is hittable. Mirrored into a ref for
  // the listeners, which must not be re-bound as it changes.
  const [reaching, setReaching] = useState(false);
  const reachingRef = useRef(false);
  const reachableRef = useRef(false);
  const controllerRef = useRef(new IdleController(DEFAULT_IDLE_SECONDS, performance.now()));
  // Read inside listeners that must not be re-bound on every preference change.
  const preferenceRef = useRef<string>(DEFAULT_SAVER_STYLE);

  // pointermove fires ~120x a second; only a real change may re-render.
  const applyReach = useCallback((next: boolean) => {
    if (reachingRef.current === next) return;
    reachingRef.current = next;
    setReaching(next);
  }, []);

  const dismiss = useCallback(() => {
    controllerRef.current.noteActivity(performance.now());
    setShowing(false);
  }, []);

  const onActivity = useCallback(
    (event: Event) => {
      const outcome = reachStep(reachInput(event), {
        reachable: reachableRef.current,
        reaching: reachingRef.current,
      });
      applyReach(outcome.reaching);
      // Before noteActivity, never after: that call both resets the clock and
      // flips the saver off, so an exempted event must not reach it at all.
      if (!outcome.wakes) return;
      if (controllerRef.current.noteActivity(performance.now())) setShowing(false);
    },
    [applyReach],
  );

  const activate = useCallback((style?: string) => {
    const controller = controllerRef.current;
    const wanted = style ?? preferenceRef.current;
    if (wanted === 'off') return;
    if (!controller.showNow(performance.now())) return;
    setScene(resolveScene(wanted, Math.random));
    setShowing(true);
  }, []);

  // The preference, once the backend is up. Until then the defaults stand.
  const readPreference = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (backend.kind !== 'ready') return;
    return readPreference();
  }, [backend.kind, readPreference]);

  // Settings saved a new style: re-read rather than be told, so the stored
  // preference stays the one source of truth for the idle path.
  useEffect(() => onSaverPreferenceChange(readPreference), [readPreference]);

  // Activity, and the release that ends a reach. Capture-phase and passive:
  // this only ever observes.
  useEffect(() => {
    const types = [...ACTIVITY, ...REACH_ONLY];
    for (const type of types) {
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    }
    return () => {
      for (const type of types) window.removeEventListener(type, onActivity, { capture: true });
    };
  }, [onActivity]);

  // Not capture: a capture-phase blur fires for every focus change inside the
  // window, and only the app losing focus should end a reach. Cmd-Tab is why
  // this exists — without it a keyup that never arrives leaves it stuck on.
  useEffect(() => {
    const onBlur = () => applyReach(false);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [applyReach]);

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

  // Only a DOM scene has anything to click, so only a DOM scene is reachable.
  // A preview counts: it is the same saver, and trying the reach there is how
  // anybody would find out what the hint means.
  const reachable = showing && isDomStyle(scene);
  useEffect(() => {
    reachableRef.current = reachable;
    // Suppression, a shuffle landing on a canvas scene, the preference going
    // off: anything that takes the saver away while the key is still down.
    if (!reachable) applyReach(false);
  }, [reachable, applyReach]);

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
      // underneath it. The overlay is what swallows it: the capture-phase
      // listener has already fired by the time these run, so stopping the event
      // here costs nothing and saves a stray click.
      onPointerDownCapture={(event) => {
        // Reaching: this one is for the story under it, and the listener above
        // has already decided it does not dismiss.
        if (reaching) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
      onKeyDownCapture={(event) => {
        if (isModifierKey(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
      onClick={(event) => {
        if (!reaching) return;
        const anchor = (event.target as Element | null)?.closest?.('a[href]');
        if (!anchor) return;
        // The anchor's own default is what opens the story: target="_blank"
        // becomes a window.open that main turns into shell.openExternal — so
        // this must not preventDefault. Dismissing waits a turn, because React
        // flushes a click's state update before the default action runs and an
        // anchor unmounted mid-dispatch loses its navigation.
        window.setTimeout(dismiss, 0);
      }}
      className={cn(
        'fixed inset-0 z-[9998] bg-background',
        reaching ? 'cursor-auto' : 'cursor-none',
      )}
      data-screensaver={scene}
      data-reaching={reaching || undefined}
    >
      {isDomStyle(scene) ? (
        <ScreensaverScene style={scene} still={reduced} reaching={reaching} />
      ) : (
        <ScreensaverCanvas style={scene} still={reduced} className="h-full w-full" />
      )}
      {isDomStyle(scene) && <ReachHint reaching={reaching} />}
    </div>
  );
}
