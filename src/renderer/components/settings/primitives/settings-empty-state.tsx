import * as React from "react";
import { cn } from "@/lib/utils";

type SettingsEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function SettingsEmptyState({ icon, title, description, action, className }: SettingsEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-10 gap-2",
        className,
      )}
    >
      {icon && (
        <div className="mb-1 text-muted-foreground [&_svg]:size-6" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-sm font-body font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground font-body max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
