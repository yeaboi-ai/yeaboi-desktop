'use client';

import { useState, useSyncExternalStore } from 'react';
import { GraduationCap, X } from 'lucide-react';
import { LEVEL_UP_SUGGEST_AT, uniqueDismissedCount } from '@/lib/term-learning-state';

const DISMISSED_KEY = 'planning-platform:levelup-banner-dismissed:v1';
const STATE_CHANGED_EVENT = 'term-learning-state:changed';

interface ComfortLevelUpBannerProps {
  /** Current value from session.ai_config.technical_comfort. Banner only shows
   *  when this is "non_technical" — comfortable/expert users don't need it. */
  technicalComfort: 'non_technical' | 'comfortable' | 'expert' | undefined;
  /** Called when the user accepts the upgrade. Caller should PATCH the
   *  session's ai_config.technical_comfort to "comfortable". */
  onUpgrade: () => void;
}

function subscribeToLearningState(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(STATE_CHANGED_EVENT, cb);
  return () => window.removeEventListener(STATE_CHANGED_EVENT, cb);
}

function getDismissedCount(): number {
  return uniqueDismissedCount();
}

/**
 * Soft suggestion to upgrade comfort level once the user has dismissed
 * enough glossary terms to suggest they're internalizing the vocabulary.
 * Local-only (per browser) — dismiss state persists in localStorage so it
 * doesn't reappear after the user says no.
 */
export function ComfortLevelUpBanner({ technicalComfort, onUpgrade }: ComfortLevelUpBannerProps) {
  // Subscribe to localStorage-backed state via the change event our
  // `recordDismissal` helper dispatches. SSR-safe: getServerSnapshot returns 0.
  const dismissedCount = useSyncExternalStore(subscribeToLearningState, getDismissedCount, () => 0);

  // User-level "don't show this banner again" — separate from individual
  // term dismissals. Local state initializer reads localStorage once.
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  });

  const eligible = technicalComfort === 'non_technical' && dismissedCount >= LEVEL_UP_SUGGEST_AT;
  if (!eligible || bannerDismissed) return null;

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setBannerDismissed(true);
  }

  function accept() {
    dismiss();
    onUpgrade();
  }

  return (
    <div
      role="status"
      className="mx-3 my-2 rounded-lg border border-[#e5a630]/30 bg-[#e5a630]/[0.06] px-3 py-2.5 flex items-start gap-2.5"
    >
      <GraduationCap className="h-4 w-4 text-[#e5a630] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground/95">
          You&apos;ve been picking up the lingo
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
          Want to switch to <strong className="text-foreground/90">Comfortable</strong> so the AI
          stops over-explaining? You can always switch back from AI settings.
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          <button
            type="button"
            onClick={accept}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-[#e5a630]/20 text-[#e5a630] hover:bg-[#e5a630]/30 transition-colors"
          >
            Upgrade
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-muted-foreground/70 hover:text-foreground px-2 py-1 rounded-md hover:bg-foreground/[0.04] transition-colors"
          >
            Not yet
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss level-up suggestion"
        className="text-muted-foreground/50 hover:text-foreground/80 transition-colors p-0.5 -mt-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
