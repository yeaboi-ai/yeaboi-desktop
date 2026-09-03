'use client';

// The duck asking to be let out.
//
// The desktop pet is opt-in, so somebody has to put the question, and the duck
// who would be doing the leaving is the one who asks. The offer takes over the
// tip companion's bubble rather than opening a second dock in the same corner:
// there is one duck, so there is one thing above him at a time.
//
// The rule for *when* is `shouldOfferPet` in shared/pet-prefs — pure, and
// tested there. Everything here is the asking and the leaving.

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { logger } from '@/lib/logger';
import { normalizePetPrefs, shouldOfferPet, type PetOfferState } from '@shared/pet-prefs';

/** How long the leap runs before the desktop duck is asked to appear. Long
 *  enough to read as a jump, short enough that nobody waits for it. */
const LEAP_MS = 420;

export interface PetOffer {
  /** The question is live and the bubble should show it. */
  open: boolean;
  /** The duck is mid-leap: he is leaving, so he stops being a tip button. */
  leaping: boolean;
  accept: (from: DOMRect | null) => void;
  decline: (state: 'later' | 'never') => void;
}

/**
 * Whether to ask, and what the answer does.
 *
 * The prefs read is a single round trip on mount; every answer writes the
 * offer record back before anything visible happens, so an app closed halfway
 * through the animation still remembers it asked.
 */
export function usePetOffer(): PetOffer {
  const [open, setOpen] = useState(false);
  const [leaping, setLeaping] = useState(false);

  useEffect(() => {
    let live = true;
    window.yeaboi
      .getPetPrefs()
      .then((stored) => {
        if (!live) return;
        if (shouldOfferPet(normalizePetPrefs(stored), Date.now())) setOpen(true);
      })
      .catch(() => logger.warn('Failed to read duck preferences'));
    return () => {
      live = false;
    };
  }, []);

  const answer = useCallback((state: PetOfferState) => {
    void window.yeaboi
      .setPetPrefs({ offer: { state, askedAt: Date.now() } })
      .catch(() => logger.warn('Failed to save the duck offer'));
  }, []);

  const decline = useCallback(
    (state: 'later' | 'never') => {
      setOpen(false);
      answer(state);
    },
    [answer],
  );

  const accept = useCallback((from: DOMRect | null) => {
    setOpen(false);
    setLeaping(true);
    // Where he is now, in screen coordinates — the desktop overlay spans a
    // display, so this is what lets him land where he jumped rather than
    // appearing somewhere else entirely. `screenX/screenY` and the rect are
    // both CSS pixels, which is also what Electron's screen coordinates are.
    const at = from
      ? {
          x: window.screenX + from.left + from.width / 2,
          y: window.screenY + from.top + from.height / 2,
        }
      : { x: window.screenX + window.innerWidth / 2, y: window.screenY + window.innerHeight / 2 };
    const timer = setTimeout(() => {
      setLeaping(false);
      void window.yeaboi.petHandoff(at).catch(() => logger.warn('Failed to let the duck out'));
    }, LEAP_MS);
    return () => clearTimeout(timer);
  }, []);

  return { open, leaping, accept, decline };
}

/** The bubble itself. Sized and positioned by the dock that renders it. */
export function PetOfferBubble({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: (state: 'later' | 'never') => void;
}) {
  return (
    <div className="px-3 pt-3 pb-2">
      <p className="text-[13px] font-medium leading-snug text-foreground">
        Want me out on your desktop?
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        I&rsquo;ll perch on your Dock and tell you when something needs you. You can send me back
        any time from Settings.
      </p>
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
        >
          Let him out
        </button>
        <button
          type="button"
          onClick={() => onDecline('later')}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground/80 transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => onDecline('never')}
          title="Don't ask again"
          aria-label="Don't ask again"
          className="ml-auto rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
