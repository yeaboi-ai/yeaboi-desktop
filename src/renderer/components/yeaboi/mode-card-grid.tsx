'use client';

// The mode card grid both homes share. Cards are the inventory
// /api/meta/capabilities serves verbatim from the TUI's _MODE_CARDS /
// _AGENT_CARDS, so the desktop can never drift from the terminal.

import type { ReactNode } from 'react';

export interface ModeCard {
  key: string;
  title: string;
  description: string;
  available: boolean;
  color: string;
}

export function ModeCardGrid({
  cards,
  onOpen,
  footer,
}: {
  cards: ModeCard[];
  onOpen: (key: string) => void;
  /** Optional per-card footer line (e.g. the agents' last-report stamp). */
  footer?: (key: string) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onOpen(card.key)}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
        >
          <h3 className="flex items-center gap-2 text-[13px] font-body font-medium text-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: card.color }}
            />
            {card.title}
          </h3>
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-snug">
            {card.description}
          </p>
          {footer?.(card.key)}
        </button>
      ))}
    </div>
  );
}
