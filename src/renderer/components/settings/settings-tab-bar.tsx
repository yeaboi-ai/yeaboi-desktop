'use client';

// The settings tab bar. Every tab is a route, so each is a link — the three
// the engine owns come from the contract, the two that configure this window
// are declared beside them.

import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { Bird, KeyRound, Palette, Share2, SlidersHorizontal, SwatchBook, Plug } from 'lucide-react';
import { ALL_SETTINGS_TABS } from '@/lib/yeaboi/settings-tabs';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/settings/credentials': KeyRound,
  '/settings/connections': Plug,
  '/settings/sharing': Share2,
  '/settings/system': SlidersHorizontal,
  '/settings/appearance': Palette,
  '/settings/themes': SwatchBook,
  '/settings/duck': Bird,
};

export function SettingsTabBar({ active }: { active: string }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const tabs = ALL_SETTINGS_TABS;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    // The table is a non-empty literal; the index is already wrapped.
    void navigate(tabs[next]!.route);
    listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-tab]')[next]?.focus();
  };

  return (
    <nav
      ref={listRef}
      role="tablist"
      aria-label="Settings sections"
      className="-mx-1 mb-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max items-center gap-0.5 border-b border-border/60">
        {tabs.map((t, index) => {
          const Icon = ICONS[t.route];
          const isActive = active === t.route || active.startsWith(`${t.route}/`);
          return (
            <Link
              key={t.route}
              to={t.route}
              role="tab"
              data-tab={t.route}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2.5 text-xs font-body font-medium outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring/50',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
              {t.title}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-0 -bottom-px left-0 h-[2px] rounded-t-sm transition-opacity',
                  isActive ? 'bg-primary opacity-100' : 'opacity-0',
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
