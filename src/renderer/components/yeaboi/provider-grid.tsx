'use client';

// The provider chooser: one card per LLM provider, mark + name + the catalog's
// own tagline. Shared by the setup flow (where nothing is picked yet) and
// Settings (where one is, and wears the amber ring).

import { useEffect, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ProviderCard } from '@/lib/yeaboi/settings';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { cn } from '@/lib/utils';

export function ProviderGrid({
  providers,
  active = '',
  onPick,
  autoFocus = true,
}: {
  providers: readonly ProviderCard[];
  /** provider_val of the one in use, if any. */
  active?: string;
  onPick: (card: ProviderCard) => void;
  autoFocus?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Arrow keys walk the cards (2-column grid); Enter picks the focused one
  // (native button behavior). First card takes focus so keys work at once.
  useEffect(() => {
    if (autoFocus) gridRef.current?.querySelector('button')?.focus();
  }, [autoFocus]);

  const onGridKey = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 2,
      ArrowUp: -2,
    };
    const delta = moves[event.key];
    if (delta === undefined || !gridRef.current) return;
    const buttons = Array.from(gridRef.current.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : Math.min(Math.max(current + delta, 0), buttons.length - 1);
    buttons[next]?.focus();
    event.preventDefault();
  };

  return (
    <div ref={gridRef} onKeyDown={onGridKey} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {providers.map((card) => {
        const on = card.provider_val === active;
        return (
          <button
            key={card.provider_val}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onPick(card)}
            /* No fill: a dozen of these inside a card that already has one was
               three shades of the same dark stacked on each other. The ring is
               what says where a tile ends, and the accent is what says which
               one is chosen. */
            className={cn(
              'group flex items-center gap-3.5 rounded-2xl px-5 py-4 text-left ring-1 transition-all',
              'focus:outline-none focus-visible:ring-primary/60',
              on ? 'ring-primary/50' : 'ring-border/50 hover:ring-primary/40',
            )}
          >
            <ProviderIcon provider={card.provider_val} size={44} />
            <span className="min-w-0 flex-1">
              <h3 className="text-[13.5px] font-body font-medium text-foreground">
                {card.full_name}
              </h3>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{card.tagline}</p>
            </span>
            {on ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
