import * as React from 'react';
import { cn } from '@/lib/utils';

type SettingsCardProps = React.HTMLAttributes<HTMLDivElement> & {
  index?: number;
  variant?: 'default' | 'subtle';
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
        'rounded-lg overflow-hidden bg-card',
        variant === 'default' ? 'border border-border' : 'border border-border/40',
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
