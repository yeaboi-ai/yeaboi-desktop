'use client';

import * as React from 'react';
import { User, Palette, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SETTINGS_TAB_IDS, type SettingsTab } from '@/hooks/use-settings-tab';

type TabMeta = {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TABS: TabMeta[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

type SettingsTabBarProps = {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
};

export function SettingsTabBar({ active, onChange }: SettingsTabBarProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    onChange(TABS[nextIndex].id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <nav
      ref={listRef}
      role="tablist"
      aria-label="Settings sections"
      className="-mx-1 mb-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-0.5 border-b border-border min-w-max">
        {TABS.map((t, index) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab={t.id}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-body font-medium outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring/50 rounded-t-md',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {t.label}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 right-0 -bottom-px h-[2px] rounded-t-sm transition-opacity',
                  isActive ? 'bg-foreground opacity-100' : 'opacity-0',
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Re-export so consumers can iterate if needed
export { SETTINGS_TAB_IDS };
