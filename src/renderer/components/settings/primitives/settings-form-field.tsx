'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type SettingsFormFieldProps = {
  id: string;
  label: string;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement;
};

export function SettingsFormField({
  id,
  label,
  htmlFor,
  help,
  error,
  required,
  className,
  children,
}: SettingsFormFieldProps) {
  const inputId = htmlFor ?? id;
  const helpId = help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  const child = React.cloneElement(children, {
    id: inputId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    ...(children.props as Record<string, unknown>),
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={inputId} className="text-xs font-body font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {child}
      {help && !error && (
        <p id={helpId} className="text-[11px] text-muted-foreground font-body">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[11px] text-destructive font-body" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
