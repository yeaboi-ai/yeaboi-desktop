'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, setExplicit, setSystemMode } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const isLight = preference.mode === 'explicit' && preference.theme_id === 'preset:light';
  const isDark = preference.mode === 'explicit' && preference.theme_id === 'preset:dark';
  const isSystem = preference.mode === 'system';

  const ActiveIcon = isSystem ? Monitor : isLight ? Sun : Moon;
  const activeLabel = isSystem ? 'System' : isLight ? 'Light' : 'Dark';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0 p-1"
        title={`Theme: ${activeLabel}`}
        aria-label={`Theme: ${activeLabel}`}
      >
        <ActiveIcon className="h-3 w-3" />
      </button>
      {open && (
        <div
          className={`absolute z-50 ${compact ? 'left-full ml-2 bottom-0' : 'right-0 bottom-full mb-1'} min-w-[140px] rounded-md border border-border bg-popover shadow-lg py-1 text-popover-foreground`}
        >
          <ThemeOption
            icon={<Sun className="h-3 w-3" />}
            label="Light"
            active={isLight}
            onClick={() => {
              setExplicit('preset:light');
              setOpen(false);
            }}
          />
          <ThemeOption
            icon={<Moon className="h-3 w-3" />}
            label="Dark"
            active={isDark}
            onClick={() => {
              setExplicit('preset:dark');
              setOpen(false);
            }}
          />
          <ThemeOption
            icon={<Monitor className="h-3 w-3" />}
            label="System"
            active={isSystem}
            onClick={() => {
              setSystemMode('preset:light', 'preset:dark');
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
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
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-body hover:bg-secondary text-left ${
        active ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {active && <span className="text-[9px] text-primary">●</span>}
    </button>
  );
}
