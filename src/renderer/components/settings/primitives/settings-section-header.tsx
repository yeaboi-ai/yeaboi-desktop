import * as React from 'react';
import { cn } from '@/lib/utils';

type SettingsSectionHeaderProps = {
  title: string;
  /** One line under the title — what this is, or what it is pointed at. */
  subtitle?: React.ReactNode;
  /** A mark for the service or the section. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function SettingsSectionHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: SettingsSectionHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3.5 border-b border-border/50 px-4 py-3', className)}>
      {icon}
      <div className="min-w-0 flex-1">
        <h2 className="text-[13.5px] font-body font-medium text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 truncate font-body text-[12px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
