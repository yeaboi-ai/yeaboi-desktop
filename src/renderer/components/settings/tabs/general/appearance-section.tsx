'use client';

import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils';

const SCHEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: MonitorSmartphone },
  { id: 'dark', label: 'Dark', icon: Moon },
] as const;

export function AppearanceSection() {
  const { preference, presets, setExplicit, setSystemMode } = useTheme();
  // Resolve the active scheme mode from the preference. "system" mode matches
  // OS preference; "explicit" with a light/dark preset surfaces as Light/Dark.
  const activeScheme: 'light' | 'dark' | 'system' = (() => {
    if (preference.mode === 'system') return 'system';
    if (preference.mode === 'explicit' && preference.theme_id) {
      if (preference.theme_id === 'preset:light') return 'light';
      if (preference.theme_id === 'preset:dark') return 'dark';
      // Any other explicit theme was picked on the Themes tab; fall back to
      // whichever scheme that theme declares.
      const colorScheme = presets[preference.theme_id as keyof typeof presets]?.color_scheme;
      return colorScheme === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  })();

  const handleScheme = (id: 'light' | 'system' | 'dark') => {
    if (id === 'system') {
      setSystemMode('preset:light', 'preset:dark');
    } else if (id === 'light') {
      setExplicit('preset:light');
    } else {
      setExplicit('preset:dark');
    }
  };

  return (
    <div className="space-y-5">
      {/* Color scheme — segmented control */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
          Color scheme
        </p>
        <div className="inline-flex rounded-lg border border-border/40 bg-background p-0.5">
          {SCHEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = activeScheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleScheme(opt.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-body font-medium transition-colors outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring/50',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
