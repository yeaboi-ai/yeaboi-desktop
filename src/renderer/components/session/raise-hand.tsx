'use client';

import { useState } from 'react';
import { Hand } from 'lucide-react';

import { useRaisedHands } from '@/hooks/use-raised-hands';

interface RaiseHandProps {
  /** Local user's display name for queue ordering. */
  myName?: string | null;
}

/**
 * Hand-raise + speaking-queue button.
 *
 * Renders a single icon button (bottom-right of the video tile, left of the
 * reactions trigger). Clicking toggles the local user's hand. A small
 * count chip appears beside the button when somebody is in the queue;
 * clicking it expands the speaker list.
 *
 * MUST be rendered inside a `<LiveKitRoom>` context.
 */
export function RaiseHand({ myName }: RaiseHandProps) {
  const { raised, me, iAmRaised, toggle } = useRaisedHands(myName ?? null);
  const [showQueue, setShowQueue] = useState(false);

  const queue = Array.from(raised.values()).sort((a, b) => a.at - b.at);
  const queueCount = queue.length;
  const queueVisible = queueCount > 0 && showQueue;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-16 z-[5] flex flex-col items-end gap-2">
      {/* Queue popover — collapsed behind the count chip unless toggled open. */}
      {queueVisible && (
        <div className="rounded-xl bg-background/85 backdrop-blur-md ring-1 ring-border/70 px-3 py-2 max-w-[240px]">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-1">
            Speaking queue
          </p>
          <ol className="space-y-0.5">
            {queue.map((h, i) => (
              <li
                key={h.who}
                className={`flex items-center gap-2 text-[12px] ${
                  h.who === me ? 'text-warning/90' : 'text-foreground/90'
                }`}
              >
                <span className="text-[10px] text-muted-foreground/70 tabular-nums w-3.5">
                  {i + 1}.
                </span>
                <Hand className="h-3 w-3" />
                <span className="truncate">{h.name ?? h.who}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-1">
        {/* Optional queue-count chip — opens the popover. Hidden when empty. */}
        {queueCount > 0 && (
          <button
            type="button"
            onClick={() => setShowQueue((v) => !v)}
            aria-label={`${queueCount} hand${queueCount === 1 ? '' : 's'} raised`}
            className="px-2 py-1 rounded-full text-[11px] font-medium bg-warning/[0.12] text-warning ring-1 ring-warning/25 hover:bg-warning/[0.2] transition-colors"
          >
            {queueCount}
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={iAmRaised}
          aria-label={iAmRaised ? 'Lower hand' : 'Raise hand'}
          title={iAmRaised ? 'Lower hand' : 'Raise hand to speak next'}
          className={`p-2 rounded-full ring-1 transition-colors backdrop-blur-md ${
            iAmRaised
              ? 'bg-warning/15 text-warning ring-warning/30'
              : 'bg-background/80 text-foreground/80 ring-border hover:text-foreground'
          }`}
        >
          <Hand className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
