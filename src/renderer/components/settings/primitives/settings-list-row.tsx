import * as React from 'react';
import { cn } from '@/lib/utils';

type SettingsListRowProps = React.HTMLAttributes<HTMLDivElement> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  hoverable?: boolean;
};

export function SettingsListRow({
  leading,
  trailing,
  hoverable = true,
  className,
  children,
  ...props
}: SettingsListRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-[var(--card-gutter,1rem)] py-2.5 transition-colors',
        hoverable && 'hover:bg-card/40',
        className,
      )}
      {...props}
    >
      {leading && <div className="shrink-0 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
    </div>
  );
}
