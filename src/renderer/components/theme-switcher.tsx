'use client';

// Light, dark, or whatever the machine is set to.
//
// The menu is the app's popover rather than a panel of its own: it is one of
// three menus that open off the same row at the bottom left, and the only one
// that used to appear and vanish where the others grow and fold away.

import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTheme } from '@/components/providers/theme-provider';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, setExplicit, setSystemMode } = useTheme();
  const [open, setOpen] = useState(false);

  const isLight = preference.mode === 'explicit' && preference.theme_id === 'preset:light';
  const isDark = preference.mode === 'explicit' && preference.theme_id === 'preset:dark';
  const isSystem = preference.mode === 'system';

  const ActiveIcon = isSystem ? Monitor : isLight ? Sun : Moon;
  const activeLabel = isSystem ? 'System' : isLight ? 'Light' : 'Dark';

  const pick = (choose: () => void) => () => {
    setOpen(false);
    choose();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
            title={`Theme: ${activeLabel}`}
            aria-label={`Theme: ${activeLabel}`}
          >
            <ActiveIcon className="h-4 w-4" />
          </button>
        }
      />
      <PopoverContent
        side={compact ? 'right' : 'top'}
        align={compact ? 'end' : 'center'}
        className="w-40 p-1"
      >
        <div role="menu" aria-label="Theme" className="flex flex-col gap-0.5">
          <ThemeOption
            icon={<Sun className="h-3 w-3" />}
            label="Light"
            active={isLight}
            onClick={pick(() => setExplicit('preset:light'))}
          />
          <ThemeOption
            icon={<Moon className="h-3 w-3" />}
            label="Dark"
            active={isDark}
            onClick={pick(() => setExplicit('preset:dark'))}
          />
          <ThemeOption
            icon={<Monitor className="h-3 w-3" />}
            label="System"
            active={isSystem}
            onClick={pick(() => setSystemMode('preset:light', 'preset:dark'))}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeOption({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-[12px] transition-colors duration-150 ${
        active
          ? 'bg-secondary/60 text-foreground'
          : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
      }`}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
