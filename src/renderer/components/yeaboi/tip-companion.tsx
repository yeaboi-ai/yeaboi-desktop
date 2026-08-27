'use client';

// The duck who hands you a tip.
//
// Mirrors the TUI welcome screen's companion lane: the duck holds the current
// tip in a speech bubble, quacks as each new one lands, and the browse / open /
// hide controls sit on the bubble's bottom edge.
//
// Page-local on purpose. The app-wide bubble (brand/duck-chrome.tsx) stays
// event-only — rotating tips were tried there and read as noise (see the note
// in lib/duck-voice.ts). This is the welcome-screen surface, which is where the
// terminal puts them too.

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Duck, useDuckPulse } from '@/components/brand/duck';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { loadSettings, saveSetting } from '@/lib/yeaboi/settings';
import { cleanTipText, resolveIndex, tipBrightness, tipRoute, type Tip } from '@/lib/yeaboi/tips';
import { AllTipsSheet } from '@/components/yeaboi/all-tips-sheet';

/** How often the clock is sampled. Fine enough for the cross-fade, coarse
 *  enough that it is one style update rather than an animation loop. */
const TICK_MS = 50;

/** Above this many tips a dot per tip is clutter, so the position reads as a count. */
const MAX_DOTS = 10;

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

export function TipCompanion({ tips, cards, onNavigate }: Props) {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // null until the backend answers — the block stays out of the way rather than
  // flashing on and then hiding itself.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [duckState, pulse] = useDuckPulse('idle');

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

  // The clock. Resumes from where it froze so a hover never loses your place.
  useEffect(() => {
    if (paused) return;
    const from = elapsedRef.current;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(from + (Date.now() - startedAt)), TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const index = resolveIndex(elapsed, offset, tips.length);
  const tip = tips[index];

  // A quack as each new tip lands — the desktop's read on the TUI's open bill.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    if (!reduced) pulse('card');
  }, [index, pulse, reduced]);

  const hide = () => {
    setEnabled(false);
    void saveSetting('TIPS_ENABLED', 'false');
  };

  const show = () => {
    setEnabled(true);
    void saveSetting('TIPS_ENABLED', 'true');
  };

  if (enabled === null || tips.length === 0) return null;

  // Never a blank slot: a hidden rotation still says how to get it back.
  if (!enabled) {
    return (
      <button
        type="button"
        onClick={show}
        className="mt-8 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        Show tips
      </button>
    );
  }

  if (!tip) return null;

  const route = tipRoute(tip);
  const card = tip.mode_key ? cards.find((c) => c.key === tip.mode_key) : undefined;
  const opacity = reduced ? 1 : tipBrightness(elapsed);

  return (
    <>
      <div
        className="mt-8 flex items-end gap-3"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {/* Decorative: the duck reports nothing the bubble does not already say,
            so he stays out of the tab order and off the a11y tree. */}
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => pulse('startled')}
          className="shrink-0 cursor-pointer bg-transparent border-0 p-0"
        >
          <Duck state={duckState} size={56} />
        </button>

        <div className="min-w-0 max-w-[560px] flex-1 rounded-2xl rounded-bl-sm bg-card ring-1 ring-border/60 shadow-sm">
          <div
            className="flex items-start gap-2 px-4 pt-3 pb-2.5"
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

          <div className="flex items-center gap-1 border-t border-border/60 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label="Previous tip"
              className="rounded-md p-1 text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label="Next tip"
              className="rounded-md p-1 text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {tips.length <= MAX_DOTS ? (
              <div className="ml-1 flex items-center gap-1">
                {tips.map((t, i) => (
                  <span
                    key={`${t.key}-${i}`}
                    className={`h-1 rounded-full transition-all ${
                      i === index ? 'w-3 bg-primary' : 'w-1 bg-muted-foreground/25'
                    }`}
                  />
                ))}
              </div>
            ) : (
              <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground/60">
                {index + 1}/{tips.length}
              </span>
            )}

            <div className="ml-auto flex items-center gap-1">
              {route && card && (
                <button
                  type="button"
                  onClick={() => onNavigate(route)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium hover:bg-secondary/60 transition-colors"
                  style={{ color: card.color }}
                >
                  Open {card.title}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                See all
              </button>
              <button
                type="button"
                onClick={hide}
                aria-label="Hide tips"
                className="rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
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
