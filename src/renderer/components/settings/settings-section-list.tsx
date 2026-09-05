'use client';

// The settings section list: a column of rows in two groups, the sections that
// configure the engine and the ones that configure this window. Every row is a
// route, so each is a link; Up and Down move through the whole list.

import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Bird,
  Blocks,
  KeyRound,
  Newspaper,
  Palette,
  Share2,
  SlidersHorizontal,
  SwatchBook,
} from 'lucide-react';
import { ALL_SETTINGS_TABS, SETTINGS_GROUPS } from '@/lib/yeaboi/settings-tabs';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/settings/credentials': KeyRound,
  '/settings/connections': Blocks,
  '/settings/sharing': Share2,
  '/settings/system': SlidersHorizontal,
  '/settings/appearance': Palette,
  '/settings/news': Newspaper,
  '/settings/themes': SwatchBook,
  '/settings/duck': Bird,
};

export function SettingsSectionList({ active, className }: { active: string; className?: string }) {
  const listRef = React.useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const rows = ALL_SETTINGS_TABS;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowDown') next = (index + 1) % rows.length;
    if (event.key === 'ArrowUp') next = (index - 1 + rows.length) % rows.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    // The table is a non-empty literal; the index is already wrapped.
    void navigate(rows[next]!.route);
    listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-section]')[next]?.focus();
  };

  let index = -1;
  return (
    <nav ref={listRef} aria-label="Settings sections" className={className}>
      {SETTINGS_GROUPS.map((group, groupIndex) => (
        <div
          key={group.key}
          className={cn(groupIndex > 0 && 'md:mt-5', 'flex flex-wrap gap-0.5 md:flex-col')}
        >
          <p className="hidden md:block px-2 mb-1 text-[11px] font-body text-muted-foreground/70">
            {group.title}
          </p>
          {group.tabs.map((t) => {
            index += 1;
            const rowIndex = index;
            const Icon = ICONS[t.route];
            const isActive = active === t.route || active.startsWith(`${t.route}/`);
            return (
              <Link
                key={t.route}
                to={t.route}
                data-section={t.route}
                onKeyDown={(e) => handleKeyDown(e, rowIndex)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs font-body font-medium outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
                {t.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
