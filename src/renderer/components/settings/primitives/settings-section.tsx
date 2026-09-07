import * as React from 'react';
import { cn } from '@/lib/utils';

type SettingsSectionProps = {
  title: string;
  /** What this section is, beside the title on the same rule. */
  subtitle?: React.ReactNode;
  /** A control the whole section answers to, at the far end of the rule. */
  action?: React.ReactNode;
  index?: number;
  animate?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** A settings section as a title over a rule, the way the connector catalog
 *  states its shelves: no fill, no ring, and rows that start at the same left
 *  edge as the title above them. */
export function SettingsSection({
  title,
  subtitle,
  action,
  index = 0,
  animate = true,
  className,
  children,
}: SettingsSectionProps) {
  return (
    <section
      className={cn(
        '[--card-gutter:0px]',
        animate && 'animate-slide-up motion-reduce:animate-none',
        className,
      )}
      style={
        animate ? { animationDelay: `${index * 60}ms`, animationFillMode: 'backwards' } : undefined
      }
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 border-b border-border/50 pb-2">
        <h2 className="font-body text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {subtitle && <span className="text-[11px] text-muted-foreground/70">{subtitle}</span>}
        {action && <div className="ml-auto shrink-0 self-center">{action}</div>}
      </div>
      {children}
    </section>
  );
}
