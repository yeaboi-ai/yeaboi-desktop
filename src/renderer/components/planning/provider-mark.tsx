// A source's mark at text size: the connector's logomark where one ships
// (components/yeaboi/provider-icon.tsx), a lucide glyph for the two built-ins,
// a two-letter monogram otherwise. Used on the @ menu's rows and on chips.

import { Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import { ICON_PATHS, ICON_VIEWBOXES } from '@/components/yeaboi/provider-icon';
import { cn } from '@/lib/utils';

export function ProviderMark({
  icon,
  size = 14,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (icon === 'link') {
    return (
      <LinkIcon aria-hidden style={box} strokeWidth={1.8} className={cn('shrink-0', className)} />
    );
  }
  if (icon === 'screenshot') {
    return (
      <ImageIcon aria-hidden style={box} strokeWidth={1.8} className={cn('shrink-0', className)} />
    );
  }
  const path = ICON_PATHS[icon];
  if (path) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={ICON_VIEWBOXES[icon] ?? '0 0 24 24'}
        className={cn('shrink-0', className)}
      >
        <path d={path} fill="currentColor" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      style={box}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] bg-foreground/10 font-body text-[8px] leading-none',
        className,
      )}
    >
      {icon.slice(0, 2).toUpperCase()}
    </span>
  );
}
