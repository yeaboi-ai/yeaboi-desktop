'use client';

import { useEffect, useRef, useState } from 'react';
import { Smile, X } from 'lucide-react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useLiveKitDataChannel } from '@/hooks/use-livekit-data-channel';

const EMOJIS = ['👍', '❤️', '🎉', '😂', '🙏', '🔥'] as const;
type Emoji = (typeof EMOJIS)[number];

interface ReactionPayload {
  emoji: Emoji;
}

interface FloatingReaction {
  id: string;
  emoji: Emoji;
  /** Random horizontal start offset (px). */
  offsetX: number;
  /** Random horizontal end offset — gives each particle its own drift path. */
  driftX: number;
  /** Random vertical drift distance (px). */
  driftY: number;
  /** Random rotation angle (deg). */
  rotation: number;
  /** Random scale multiplier (0.8..1.4). */
  scale: number;
  /** Per-particle delay (ms) for staggered burst. */
  delay: number;
  /** Spawn timestamp (used for GC). */
  spawned: number;
}

const FLOAT_DURATION_MS = 2800;
const PARTICLES_PER_REACTION = 5;
const AUTO_CLOSE_AFTER_PICK_MS = 1200;
const AUTO_CLOSE_IDLE_MS = 4000;

/**
 * Reactions overlay — collapsed trigger + popover picker that opens ABOVE the
 * trigger so it never collides with the raise-hand button next to it.
 *
 * Dismissal paths (any of these closes it):
 *   - Click outside the picker.
 *   - Press Esc.
 *   - Click the explicit X close button.
 *   - Click an emoji (auto-closes after a short confirmation delay).
 *   - Idle timeout after 4s of no interaction.
 *
 * MUST be rendered inside a `<LiveKitRoom>` context (parent should be
 * `position: relative`).
 */
export function ReactionsOverlay() {
  const reducedMotion = useReducedMotion();
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cancelAutoClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleAutoClose = (ms: number) => {
    cancelAutoClose();
    closeTimerRef.current = setTimeout(() => setPickerOpen(false), ms);
  };

  // Cleanup the close timer on unmount.
  useEffect(
    () => () => {
      cancelAutoClose();
    },
    [],
  );

  // Click-outside + Escape dismissal.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && wrapperRef.current.contains(e.target)) return;
      setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // Idle close — restarts every render that flips pickerOpen to true.
  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(() => setPickerOpen(false), AUTO_CLOSE_IDLE_MS);
    return () => clearTimeout(t);
  }, [pickerOpen]);

  // Pulse the trigger briefly when *we* fire a reaction so the user gets
  // immediate haptic-style feedback even while the burst is still animating.
  const [triggerPulse, setTriggerPulse] = useState(false);

  const { send, me } = useLiveKitDataChannel<'reactions'>({
    topic: 'reactions',
    includeLocalEcho: true,
    onEvent: (event) => {
      if (event.type !== 'reaction') return;
      const p = event.payload as ReactionPayload;
      if (!EMOJIS.includes(p.emoji)) return;
      const now = Date.now();
      const burst: FloatingReaction[] = [];
      for (let i = 0; i < PARTICLES_PER_REACTION; i++) {
        burst.push({
          id: `${event.from}-${event.ts}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          emoji: p.emoji,
          // Spread particles across ~140px horizontally at spawn.
          offsetX: Math.round((Math.random() - 0.5) * 140),
          // Drift ±80px sideways during travel.
          driftX: Math.round((Math.random() - 0.5) * 160),
          // Vary rise distance 180..280px so the column has depth.
          driftY: -(180 + Math.round(Math.random() * 100)),
          rotation: Math.round((Math.random() - 0.5) * 60),
          scale: 0.8 + Math.random() * 0.6,
          delay: i * 60 + Math.round(Math.random() * 40),
          spawned: now,
        });
      }
      setFloats((prev) => [...prev, ...burst]);
      // Trigger pulse only for our own reactions (visible feedback).
      if (event.from === me) {
        setTriggerPulse(true);
        setTimeout(() => setTriggerPulse(false), 600);
      }
    },
  });

  // Garbage-collect old floats. Includes a buffer for the per-particle delay.
  useEffect(() => {
    if (floats.length === 0) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - (FLOAT_DURATION_MS + 600);
      setFloats((prev) => prev.filter((f) => f.spawned > cutoff));
    }, 600);
    return () => clearInterval(id);
  }, [floats.length]);

  return (
    <>
      {/* Collapsed trigger anchored bottom-right of the video tile.
          The picker pops up *above* this trigger as a separate row, so it
          never collides with the raise-hand button to its left. */}
      <div
        ref={wrapperRef}
        className="pointer-events-auto absolute bottom-3 right-3 z-[5] flex flex-col items-end gap-2"
      >
        {pickerOpen && (
          <div
            className="flex items-center gap-1 px-1.5 py-1 rounded-full bg-background/85 backdrop-blur-md ring-1 ring-border shadow-lg"
            role="toolbar"
            aria-label="Send a reaction"
            onMouseEnter={cancelAutoClose}
            onMouseLeave={() => scheduleAutoClose(AUTO_CLOSE_IDLE_MS)}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  send<ReactionPayload>('reaction', { emoji: e });
                  scheduleAutoClose(AUTO_CLOSE_AFTER_PICK_MS);
                }}
                aria-label={`React with ${e}`}
                className="px-1.5 py-0.5 rounded-full text-base hover:bg-foreground/[0.10] hover:scale-110 transition-transform"
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Close reactions"
              className="ml-1 p-1 rounded-full text-muted-foreground/60 hover:text-foreground/95 hover:bg-foreground/[0.10] transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            cancelAutoClose();
            setPickerOpen((v) => !v);
          }}
          aria-label={pickerOpen ? 'Close reactions' : 'Open reactions'}
          aria-expanded={pickerOpen}
          className={`p-2 rounded-full ring-1 transition-colors backdrop-blur-md ${
            pickerOpen
              ? 'bg-foreground/[0.10] text-foreground ring-white/20'
              : 'bg-background/80 text-foreground/80 ring-border hover:text-foreground'
          } ${triggerPulse && !reducedMotion ? 'reaction-trigger-pulse' : ''}`}
        >
          <Smile className="h-4 w-4" />
        </button>
      </div>

      {/* Floats — burst of particles that pop in, drift up + sideways with rotation, then fade. */}
      <div className="pointer-events-none absolute bottom-14 right-8 z-[4]" aria-hidden>
        <div className="relative w-0 h-0">
          {floats.map((f) => (
            <span
              key={f.id}
              className={reducedMotion ? 'reaction-float-static' : 'reaction-particle'}
              style={
                reducedMotion
                  ? {
                      position: 'absolute',
                      left: `${f.offsetX}px`,
                      transform: `translate(-50%, ${f.driftY / 2}px)`,
                      fontSize: `${Math.round(28 * f.scale)}px`,
                    }
                  : ({
                      position: 'absolute',
                      left: `${f.offsetX}px`,
                      fontSize: `${Math.round(36 * f.scale)}px`,
                      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
                      // Custom properties consumed by the keyframes below.
                      ['--rx-drift-x' as string]: `${f.driftX}px`,
                      ['--rx-drift-y' as string]: `${f.driftY}px`,
                      ['--rx-rotate' as string]: `${f.rotation}deg`,
                      ['--rx-scale' as string]: f.scale,
                      animationDelay: `${f.delay}ms`,
                    } as React.CSSProperties)
              }
            >
              {f.emoji}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes reaction-particle-burst {
          /* Pop in: scale up sharply with full opacity. */
          0% {
            transform: translate(-50%, 0) scale(0.2) rotate(0deg);
            opacity: 0;
          }
          12% {
            transform: translate(-50%, -10px) scale(calc(var(--rx-scale) * 1.25)) rotate(calc(var(--rx-rotate) * 0.2));
            opacity: 1;
          }
          /* Settle: pull back to natural scale. */
          22% {
            transform: translate(-50%, -22px) scale(var(--rx-scale)) rotate(calc(var(--rx-rotate) * 0.4));
            opacity: 1;
          }
          /* Float upward + drift sideways, slight wobble in rotation. */
          70% {
            transform: translate(calc(-50% + (var(--rx-drift-x) * 0.7)), calc(var(--rx-drift-y) * 0.7)) scale(var(--rx-scale)) rotate(var(--rx-rotate));
            opacity: 0.85;
          }
          100% {
            transform: translate(calc(-50% + var(--rx-drift-x)), var(--rx-drift-y)) scale(calc(var(--rx-scale) * 0.7)) rotate(calc(var(--rx-rotate) * 1.2));
            opacity: 0;
          }
        }
        .reaction-particle {
          animation: reaction-particle-burst ${FLOAT_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
          will-change: transform, opacity;
        }
        .reaction-float-static {
          opacity: 0.85;
        }
        @keyframes reaction-trigger-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); transform: scale(1); }
          30% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.18); transform: scale(1.12); }
          70% { box-shadow: 0 0 0 12px rgba(255, 255, 255, 0); transform: scale(1); }
        }
        .reaction-trigger-pulse {
          animation: reaction-trigger-pulse 600ms ease-out;
        }
      `}</style>
    </>
  );
}
