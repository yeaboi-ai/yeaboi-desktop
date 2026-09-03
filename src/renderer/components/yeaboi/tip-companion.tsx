'use client';

// The duck who hands you a tip.
//
// A dock pinned to the window's bottom-right corner: the duck perches there and
// the bubble grows upward out of him. The bubble is positioned against the duck
// rather than stacked with him, so retracting it never makes him move.
//
// Home-screen only, which is where the terminal puts tips too. An app-wide
// rotating bubble was tried and read as noise (see the note in lib/duck-voice.ts).

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { DuckMark, useDuckPulse } from '@/components/brand/duck';
import { useNikoContext } from '@/components/niko/niko-provider';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { COLLAPSED_WIDTH } from '@/lib/yeaboi/niko';
import { loadSettings, saveSetting } from '@/lib/yeaboi/settings';
import {
  cleanTipText,
  dockMode,
  dockWidth,
  resolveIndex,
  tipBrightness,
  tipProgress,
  tipRoute,
  type Tip,
} from '@/lib/yeaboi/tips';
import { AllTipsSheet } from '@/components/yeaboi/all-tips-sheet';
import { LEAP_MS, PetOfferBubble, usePetOffer } from '@/components/yeaboi/pet-offer';

/** How often the clock is sampled. Fine enough for the cross-fade and the
 *  hairline, coarse enough that it is one style update rather than a loop. */
const TICK_MS = 50;

const DUCK_SIZE = 72;
/** The duck, once tips are off — present enough to click, quiet enough to ignore. */
const QUIET_DUCK_SIZE = 40;

interface ModeCard {
  key: string;
  title: string;
  color: string;
}

interface Props {
  tips: Tip[];
  /** The mode + agent cards from /api/meta/capabilities, for titles and accents. */
  cards: ModeCard[];
  onNavigate: (route: string) => void;
}

/** The window's width, resampled on resize. Mirrors niko-bar's useOpenWidth. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function TipCompanion({ tips, cards, onNavigate }: Props) {
  const reduced = useReducedMotion();
  const { isOpen: nikoOpen } = useNikoContext();
  const innerWidth = useWindowWidth();

  const [elapsed, setElapsed] = useState(0);
  const [offset, setOffset] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // null until the backend answers — the dock stays out of the way rather than
  // flashing on and then hiding itself.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [duckState, pulse] = useDuckPulse('idle');
  const offer = usePetOffer();
  // The duck's own box, so a hand-off starts from where he actually is rather
  // than from a guess at the corner.
  const duckRef = useRef<HTMLDivElement>(null);

  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  useEffect(() => {
    loadSettings().then(
      ({ fields }) => {
        const field = fields.find((f) => f.env === 'TIPS_ENABLED');
        // Anything but the literal "false" counts as on, matching is_tips_enabled().
        setEnabled((field?.active_choice ?? field?.value ?? 'true') !== 'false');
      },
      () => setEnabled(true),
    );
  }, []);

  const mode = dockMode({
    enabled,
    tipCount: tips.length,
    nikoOpen,
    innerWidth,
    pillWidth: COLLAPSED_WIDTH,
  });

  // The clock. Runs only while the bubble is on screen and nothing is holding
  // it, and resumes from where it froze — a hover, a Niko turn or a trip through
  // the gallery never loses your place.
  const running = mode === 'bubble' && !engaged && !galleryOpen;
  useEffect(() => {
    if (!running) return;
    const from = elapsedRef.current;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(from + (Date.now() - startedAt)), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const index = resolveIndex(elapsed, offset, tips.length);
  const tip = tips[index];

  // A quack as each new tip lands — the desktop's read on the TUI's open bill.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    if (!reduced) pulse('card');
  }, [index, pulse, reduced]);

  const setEnabledSetting = (value: boolean) => {
    setEnabled(value);
    void saveSetting('TIPS_ENABLED', value ? 'true' : 'false');
  };

  if (mode === 'off') return null;

  // Never a blank corner: tips off leaves a quiet duck that turns them back on.
  if (mode === 'quiet') {
    return (
      <button
        type="button"
        onClick={() => setEnabledSetting(true)}
        title="Show tips"
        aria-label="Show tips"
        className="fixed bottom-6 right-6 z-30 cursor-pointer border-0 bg-transparent p-0 opacity-40 transition-opacity hover:opacity-100"
      >
        <DuckMark size={QUIET_DUCK_SIZE} facing="left" />
      </button>
    );
  }

  const route = tip ? tipRoute(tip) : null;
  const card = tip?.mode_key ? cards.find((c) => c.key === tip.mode_key) : undefined;
  const accent = card?.color ?? 'var(--primary)';
  const opacity = reduced ? 1 : tipBrightness(elapsed);
  // Hidden until the dock is hovered OR focused — focus-within is what keeps
  // these reachable from the keyboard.
  // Hidden until the dock is hovered OR focused — focus-within is what keeps
  // these reachable from the keyboard. Under reduced motion they stay put: the
  // rotation still advances, and the way to stop it must not itself be behind a
  // hover (WCAG 2.2.2).
  const reveal = reduced
    ? ''
    : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100';

  return (
    <>
      <div
        className="group fixed bottom-6 right-6 z-30"
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => setEngaged(false)}
        onFocusCapture={() => setEngaged(true)}
        onBlurCapture={() => setEngaged(false)}
      >
        {offer.open && (
          <div
            className="absolute bottom-full right-2 mb-2.5 rounded-2xl bg-card shadow-lg ring-1 ring-border/60"
            style={{
              width: `${dockWidth(innerWidth, COLLAPSED_WIDTH)}px`,
              transformOrigin: 'bottom right',
              animation: reduced ? undefined : 'tip-bubble-in 200ms ease-out',
            }}
          >
            <PetOfferBubble
              onAccept={() => offer.accept(duckRef.current?.getBoundingClientRect() ?? null)}
              onDecline={offer.decline}
            />
          </div>
        )}

        {mode === 'bubble' && tip && !offer.open && (
          <div
            className="absolute bottom-full right-2 mb-2.5 rounded-2xl bg-card shadow-lg ring-1 ring-border/60"
            style={{
              width: `${dockWidth(innerWidth, COLLAPSED_WIDTH)}px`,
              transformOrigin: 'bottom right',
              animation: reduced ? undefined : 'tip-bubble-in 200ms ease-out',
            }}
          >
            {/* The rotation clock, as the bubble's top edge. Left out under
                reduced motion, where the always-visible counter carries it. */}
            {!reduced && (
              <div className="absolute left-4 right-4 top-0 h-0.5 overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full"
                  style={{ width: `${tipProgress(elapsed) * 100}%`, background: accent }}
                />
              </div>
            )}

            <div
              className="flex items-start gap-2 px-4 pb-2 pt-3.5"
              style={{ opacity, transition: reduced ? undefined : 'opacity 60ms linear' }}
              aria-live="polite"
            >
              {/* A maturity caveat outranks a freshness cue; never both. */}
              {tip.is_beta ? (
                <span className="mt-px shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-warning">
                  BETA
                </span>
              ) : tip.is_new ? (
                <span className="mt-px shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary">
                  NEW
                </span>
              ) : null}
              <p className="text-[13px] leading-snug text-foreground">{cleanTipText(tip.text)}</p>
            </div>

            {/* One row at a fixed height: hovering changes opacity, never layout. */}
            <div className="flex h-9 items-center gap-0.5 px-2">
              <div className={`flex items-center gap-0.5 ${reveal}`}>
                <button
                  type="button"
                  onClick={() => setOffset((o) => o - 1)}
                  aria-label="Previous tip"
                  className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOffset((o) => o + 1)}
                  aria-label="Next tip"
                  className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <span className="ml-1 text-[11px] tabular-nums text-muted-foreground/60">
                  {index + 1}/{tips.length}
                </span>
                <button
                  type="button"
                  onClick={() => setGalleryOpen(true)}
                  className="ml-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  See all tips
                </button>
              </div>

              <div className="ml-auto flex items-center gap-0.5">
                {route && card && (
                  <button
                    type="button"
                    onClick={() => onNavigate(route)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-secondary/60"
                    style={{ color: accent }}
                  >
                    Open {card.title}
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEnabledSetting(false)}
                  title="Turn tips off"
                  aria-label="Turn tips off"
                  className={`rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-secondary/60 hover:text-foreground ${reveal}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* The tail, pointing down at the duck's head. Two borders only, so
                it reads as the bubble's own corner rather than a pasted square. */}
            <span
              aria-hidden
              className="absolute h-2.5 w-2.5 rotate-45 rounded-[1px] bg-card"
              style={{
                bottom: '-5px',
                // `right` positions the tail's edge and it is 10px wide: the
                // duck's centre is 36px from the dock's edge, the bubble 8px in.
                right: '23px',
                borderRight: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
              }}
            />
          </div>
        )}

        {/* With the bubble up the duck reports nothing it does not already say,
            so he stays out of the tab order and off the a11y tree. Retracted he
            is the only thing left, so he becomes the way in — otherwise there is
            no route to the tips at all while Niko's bar is open. */}
        {/* The leap out and the leap back. While he is 'away' the corner holds
            nothing at all — he is on the desktop, and a duck in both places at
            once would undo the whole point of the hand-off. Under reduced
            motion the arcs are skipped and only the presence changes. */}
        {offer.where !== 'away' && (
          <div
            ref={duckRef}
            style={
              reduced || offer.where === 'here'
                ? undefined
                : {
                    animation: `duck-leap-${offer.where === 'leaving' ? 'out' : 'in'} ${LEAP_MS}ms cubic-bezier(0.4, 0, 0.6, 1) forwards`,
                  }
            }
          >
            {mode === 'duck' ? (
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                title="See all tips"
                aria-label="See all tips"
                className="block cursor-pointer rounded-full border-0 bg-transparent p-0"
              >
                <DuckMark state={duckState} size={DUCK_SIZE} facing="left" />
              </button>
            ) : (
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => pulse('startled')}
                className="block cursor-pointer border-0 bg-transparent p-0"
              >
                <DuckMark state={duckState} size={DUCK_SIZE} facing="left" />
              </button>
            )}
          </div>
        )}
      </div>

      <AllTipsSheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        tips={tips}
        titles={Object.fromEntries(cards.map((c) => [c.key, c.title]))}
        colors={Object.fromEntries(cards.map((c) => [c.key, c.color]))}
        onNavigate={onNavigate}
      />
    </>
  );
}
