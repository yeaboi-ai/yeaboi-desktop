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

// No leap animation lives here any more. The pet overlay is full-screen and
// above every window, so the duck who jumps out is the *desktop* duck, drawn
// on top of the app at the exact spot the app was drawing its own. The app's
// job is to stop drawing his at that instant — one duck, no hand-off, and an
// arc with the whole screen to travel through instead of 24px of dock margin.

/** Where the duck is, from the app's point of view. */
export type DuckWhereabouts =
  /** In the corner, as ever. */
  | 'here'
  /** The desktop duck has him. Nothing is drawn in the corner — he is up on
   *  the overlay, which is where every frame of the leap is drawn. */
  | 'away';

export interface PetOffer {
  /** The question is live and the bubble should show it. */
  open: boolean;
  where: DuckWhereabouts;
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
  const [where, setWhere] = useState<DuckWhereabouts>('here');

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

  // He is out on the desktop showing where he lives; when he is done there,
  // main says so and he comes back in through the corner he left by.
  useEffect(() => {
    // He has flown back to the exact spot the corner draws him, so the corner
    // can take him back with no transition at all: the pixels do not move.
    window.yeaboi.onPetReturned(() => setWhere('here'));
  }, []);

  const accept = useCallback((from: DOMRect | null) => {
    setOpen(false);
    // Hidden here before the desktop duck is asked for, so the two never
    // overlap; the overlay draws him at the same place a frame later.
    setWhere('away');
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
    void window.yeaboi.petHandoff(at).catch(() => {
      logger.warn('Failed to let the duck out');
      // Nothing out there to come back, so put him where he was.
      setWhere('here');
    });
  }, []);

  return { open, where, accept, decline };
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
