'use client';

// The mode menu: the terminal's cards as one wrapping row. A card is its
// accent dot, its name in the display face, and the backend's own sentence;
// a mode the sidecar cannot run stays in the row, muted, and says so. The
// arrow keys walk the row (lib/home/menu.ts decides where), Enter opens.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { menuMove, type MenuKey } from '@/lib/home/menu';
import type { ModeCard } from '@/lib/yeaboi/capabilities';

const MENU_KEYS = new Set<string>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

/** The word beside a card's name when the sidecar flags it. */
export function badgeWord(badge: string | undefined): string {
  return badge ? badge.toLowerCase() : '';
}

export function ModeMenu({
  cards,
  hrefFor,
}: {
  cards: ModeCard[];
  /** Where a card opens; null leaves it inert. */
  hrefFor: (key: string) => string | null;
}) {
  const [focused, setFocused] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  // The row wraps at whatever width it has, so the row length is measured,
  // not declared: the cards sharing the first card's top edge.
  const columns = (): number => {
    const items = Array.from(list.current?.children ?? []) as HTMLElement[];
    if (items.length === 0) return 1;
    const top = items[0]!.offsetTop;
    return Math.max(1, items.filter((item) => item.offsetTop === top).length);
  };

  useEffect(() => {
    if (focused >= cards.length) setFocused(Math.max(0, cards.length - 1));
  }, [cards.length, focused]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!MENU_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = menuMove(focused, event.key as MenuKey, cards.length, columns());
    setFocused(next);
    const items = Array.from(list.current?.children ?? []) as HTMLElement[];
    items[next]?.querySelector<HTMLElement>('a, [tabindex]')?.focus();
  };

  return (
    <ul
      ref={list}
      role="list"
      aria-label="Modes"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-x-10 gap-y-6"
    >
      {cards.map((card, index) => {
        const href = card.available ? hrefFor(card.key) : null;
        const word = badgeWord(card.badge);
        const body = (
          <>
            <span className="flex items-baseline gap-2.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: card.available ? card.color : 'var(--border)' }}
              />
              <span
                className={`font-display text-[22px] leading-none decoration-1 underline-offset-[4px] ${
                  href ? 'text-foreground group-hover:underline' : 'text-muted-foreground'
                }`}
              >
                {card.title}
              </span>
              {word && (
                <span className="text-[12px] font-body text-muted-foreground/70">{word}</span>
              )}
            </span>
            <span className="mt-1.5 block text-[13px] leading-snug text-muted-foreground">
              {card.available ? card.description : 'not configured'}
            </span>
          </>
        );
        return (
          <li key={card.key} className="w-[15rem] max-w-full">
            {href ? (
              <Link
                href={href}
                tabIndex={index === focused ? 0 : -1}
                onFocus={() => setFocused(index)}
                className="group block"
              >
                {body}
              </Link>
            ) : (
              <div tabIndex={index === focused ? 0 : -1} onFocus={() => setFocused(index)}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
