'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SettingsSaveBarProps = {
  visible: boolean;
  message?: string;
  saving?: boolean;
  saved?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  className?: string;
};

export function SettingsSaveBar({
  visible,
  message = 'You have unsaved changes',
  saving,
  saved,
  onSave,
  onCancel,
  saveLabel = 'Save',
  className,
}: SettingsSaveBarProps) {
  if (!visible && !saved) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 backdrop-blur px-4 py-2.5 shadow-sm animate-slide-up motion-reduce:animate-none',
        className,
      )}
    >
      <p className="text-xs font-body text-muted-foreground">{saved ? 'Saved' : message}</p>
      <div className="flex items-center gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </div>
  );
}
