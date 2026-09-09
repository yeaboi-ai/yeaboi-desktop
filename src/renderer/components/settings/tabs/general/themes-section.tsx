'use client';

// The theme, where the rest of this window's appearance is set.
//
// A quick switch over the built-ins, and a way through to the full page for
// everything else — custom presets, brand suggestions, uploads.
//
// It deliberately does not fetch. Appearance renders outside BackendGate so
// the theme still switches with the sidecar down; discovering presets the
// provider has not already loaded is what "Manage themes" is for.

import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { BUILTIN_ORDER, BUILTIN_PRESETS } from '@/lib/theme/presets';
import type { ThemeId } from '@/lib/theme/types';
import { cn } from '@/lib/utils';

/** The three tokens a swatch draws, in the order they read as a palette. */
const SWATCH_TOKENS = ['background', 'primary', 'foreground'] as const;

function Swatch({
  id,
  name,
  active,
  onPick,
  onPreview,
  onCancelPreview,
  tokens,
}: {
  id: string;
  name: string;
  active: boolean;
  onPick: () => void;
  onPreview: () => void;
  onCancelPreview: () => void;
  tokens: Record<string, string>;
}) {
  return (
    <button
      key={id}
      type="button"
      aria-pressed={active}
      aria-label={name}
      title={name}
      onClick={onPick}
      onPointerEnter={onPreview}
      onPointerLeave={onCancelPreview}
      onFocus={onPreview}
      onBlur={onCancelPreview}
      className={cn(
        'group flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        active ? 'bg-secondary' : 'hover:bg-card/60',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-12 overflow-hidden rounded-md border',
          active ? 'border-foreground/40' : 'border-border/50',
        )}
      >
        {SWATCH_TOKENS.map((token) => (
          <span
            key={token}
            className="flex-1"
            style={{ background: tokens[token] ?? 'transparent' }}
          />
        ))}
      </span>
      <span
        className={cn(
          'max-w-[64px] truncate text-[10px] font-body',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {name}
      </span>
    </button>
  );
}

export function ThemesSection() {
  const { themeId, preference, presets, customThemes, setExplicit, previewTheme, cancelPreview } =
    useTheme();

  const activeName =
    presets[themeId as keyof typeof presets]?.name ?? customThemes[themeId]?.name ?? 'Custom';
  const following =
    preference.mode === 'system'
      ? 'Following your system'
      : preference.mode === 'org_default'
        ? 'Your organisation’s default'
        : '';

  // customThemes is keyed by ThemeId; Object.entries widens that to string.
  const custom = Object.entries(customThemes) as [ThemeId, (typeof customThemes)[ThemeId]][];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[13px] font-body text-foreground">
          {activeName}
          {following && <span className="text-muted-foreground"> · {following}</span>}
        </p>
        <Link
          to="/settings/themes"
          className="inline-flex items-center gap-1 text-[12px] font-body text-muted-foreground hover:text-foreground"
        >
          Manage themes
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-1">
        {BUILTIN_ORDER.map((id) => (
          <Swatch
            key={id}
            id={id}
            name={BUILTIN_PRESETS[id].name}
            tokens={BUILTIN_PRESETS[id].tokens as Record<string, string>}
            active={themeId === id}
            onPick={() => setExplicit(id)}
            onPreview={() => previewTheme(id)}
            onCancelPreview={cancelPreview}
          />
        ))}
        {custom.map(([id, doc]) => (
          <Swatch
            key={id}
            id={id}
            name={doc.name}
            tokens={doc.tokens as Record<string, string>}
            active={themeId === id}
            onPick={() => setExplicit(id)}
            onPreview={() => previewTheme(id)}
            onCancelPreview={cancelPreview}
          />
        ))}
      </div>
    </div>
  );
}
