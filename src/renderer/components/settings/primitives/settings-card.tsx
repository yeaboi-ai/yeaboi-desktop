import * as React from 'react';
import { cn } from '@/lib/utils';

type SettingsCardProps = React.HTMLAttributes<HTMLDivElement> & {
  index?: number;
  /** `flat` drops the fill: sections on the page rather than cards on it. */
  variant?: 'default' | 'subtle' | 'flat';
  animate?: boolean;
};

export function SettingsCard({
  className,
  children,
  index = 0,
  variant = 'default',
  animate = true,
  style,
  ...props
}: SettingsCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl ring-1',
        variant === 'flat' ? 'overflow-visible' : 'overflow-hidden',
        variant === 'flat' && 'bg-transparent ring-border/40 [--card-gutter:1rem]',
        variant === 'default' && 'bg-card ring-border/60',
        variant === 'subtle' && 'bg-card ring-border/30',
        animate && 'animate-slide-up motion-reduce:animate-none',
        className,
      )}
      style={animate ? { animationDelay: `${index * 60}ms`, ...style } : style}
      {...props}
    >
      {children}
    </div>
  );
}
