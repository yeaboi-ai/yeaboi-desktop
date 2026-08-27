'use client';

import { AlertTriangle, Bug, Compass, Sparkles, Tag, Wrench, type LucideIcon } from 'lucide-react';

// Visual mapping for the 5 system templates. Custom templates fall back to a
// neutral pill so the board still says *something* about the type even when
// the slug isn't one we recognise.
interface TypeStyle {
  Icon: LucideIcon;
  // Tailwind utility chunks for the badge. We split bg/text/border so the
  // density-compact form can drop the bg and keep just the icon colour.
  bg: string;
  text: string;
  border: string;
  /** Short label rendered next to the icon in comfortable density. */
  label: string;
}

const SYSTEM_STYLES: Record<string, TypeStyle> = {
  feature: {
    Icon: Sparkles,
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Feature',
  },
  bug: {
    Icon: Bug,
    bg: 'bg-red-500/15',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/30',
    label: 'Bug',
  },
  chore: {
    Icon: Wrench,
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
    label: 'Chore',
  },
  spike: {
    Icon: Compass,
    bg: 'bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
    label: 'Spike',
  },
  tech_debt: {
    Icon: AlertTriangle,
    bg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    label: 'Tech debt',
  },
};

const FALLBACK: TypeStyle = {
  Icon: Tag,
  bg: 'bg-muted',
  text: 'text-muted-foreground',
  border: 'border-border',
  label: 'Type',
};

function styleFor(slug: string | null | undefined): TypeStyle {
  if (!slug) return FALLBACK;
  return SYSTEM_STYLES[slug] ?? FALLBACK;
}

interface Props {
  slug: string | null | undefined;
  name?: string | null;
  variant?: 'icon' | 'pill';
  size?: 'xs' | 'sm';
  className?: string;
}

// Icon-only chip (default) sits flush against the friendly_id; the pill variant
// renders the label too and is used in the ticket detail header where there's room.
export function TemplateBadge({
  slug,
  name,
  variant = 'icon',
  size = 'xs',
  className = '',
}: Props) {
  const style = styleFor(slug);
  const tooltip = name ?? style.label;

  if (variant === 'icon') {
    const dim = size === 'xs' ? 'h-4 w-4' : 'h-5 w-5';
    return (
      <span
        title={tooltip}
        aria-label={`Type: ${tooltip}`}
        className={`inline-flex items-center justify-center rounded-[3px] border ${style.bg} ${style.text} ${style.border} ${dim} ${className}`}
      >
        <style.Icon className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      <style.Icon className="h-3 w-3" />
      {(name ?? style.label).slice(0, 12)}
    </span>
  );
}
