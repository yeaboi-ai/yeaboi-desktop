'use client';

// The settings tab bar, in two groups: the tabs that configure the engine and
// this window, then, after a gap, the pages about the app itself. Every tab
// is a route, so each is a link; arrow keys move across the whole bar.

import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Bird,
  Blocks,
  KeyRound,
  Lock,
  Megaphone,
  MessageSquareText,
  Palette,
  Share2,
  SlidersHorizontal,
  Stethoscope,
  SwatchBook,
} from 'lucide-react';
import { ALL_SETTINGS_TABS, SETTINGS_TAB_GROUPS } from '@/lib/yeaboi/settings-tabs';
import { updateIndicatorVisible } from '@shared/update';
import { useUpdateState } from '@/hooks/use-update-state';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/settings/credentials': KeyRound,
  '/settings/connections': Blocks,
  '/settings/sharing': Share2,
  '/settings/system': SlidersHorizontal,
  '/settings/appearance': Palette,
  '/settings/themes': SwatchBook,
  '/settings/duck': Bird,
  '/whats-new': Megaphone,
  '/system-check': Stethoscope,
  '/privacy': Lock,
  '/feedback': MessageSquareText,
};

export function SettingsTabBar({ active }: { active: string }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const tabs = ALL_SETTINGS_TABS;
  const updateDot = updateIndicatorVisible(useUpdateState(), null);

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

  let index = -1;
  return (
    <nav
      ref={listRef}
      role="tablist"
      aria-label="Settings sections"
      className="-mx-1 mb-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max items-end gap-0.5 border-b border-border/60">
        {SETTINGS_TAB_GROUPS.map((group, groupIndex) => (
          <React.Fragment key={group.key}>
            {groupIndex > 0 && (
              <span className="ml-6 mr-1 pb-2.5 text-[12px] font-body text-muted-foreground/70 whitespace-nowrap">
                {group.title}
              </span>
            )}
            {group.tabs.map((t) => {
              index += 1;
              const tabIndex = index;
              const Icon = ICONS[t.route];
              const isActive = active === t.route || active.startsWith(`${t.route}/`);
              const dot = t.route === '/whats-new' && updateDot;
              return (
                <Link
                  key={t.route}
                  to={t.route}
                  role="tab"
                  data-tab={t.route}
                  onKeyDown={(e) => handleKeyDown(e, tabIndex)}
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
                  {dot && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-400"
                      title="An update is ready"
                    />
                  )}
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
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}
