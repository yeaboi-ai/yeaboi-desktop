import * as React from "react";
import { cn } from "@/lib/utils";

type SettingsSectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
};

export function SettingsSectionHeader({ title, subtitle, action, className }: SettingsSectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 py-4 border-b border-border", className)}>
      <div className="min-w-0">
        <h2 className="text-xs font-body font-semibold text-foreground tracking-wide">{title}</h2>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground font-body mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
