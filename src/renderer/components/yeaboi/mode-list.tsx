'use client';

// The mode inventory as a plain list: the mode's dot, its name, and the
// backend's own one-sentence description. Cards are /api/meta/capabilities
// verbatim from the TUI's _MODE_CARDS, so the desktop never drifts from the
// terminal. A mode the sidecar marks unavailable stays in the list, muted, and
// says why in two words.

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ModeCard } from '@/lib/yeaboi/capabilities';

export function ModeList({
  cards,
  hrefFor,
  trailing,
}: {
  cards: ModeCard[];
  /** Where a mode starts; null leaves the row inert. */
  hrefFor: (key: string) => string | null;
  /** A right-hand slot per row, such as a last-run stamp. */
  trailing?: (card: ModeCard) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border/50">
      {cards.map((card) => {
        const href = card.available ? hrefFor(card.key) : null;
        const body = (
          <>
            <span
              aria-hidden
              className="mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: card.available ? card.color : 'var(--border)' }}
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[14px] font-body font-medium ${
                  card.available
                    ? 'text-foreground group-hover:text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {card.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                {card.description}
              </span>
            </span>
            <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground">
              {card.available ? trailing?.(card) : 'not configured'}
            </span>
          </>
        );
        return (
          <li key={card.key}>
            {href ? (
              <Link href={href} className="group flex items-start gap-3 py-2.5 transition-colors">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
