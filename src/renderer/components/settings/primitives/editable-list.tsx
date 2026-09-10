// One editor for every list-valued setting: rows with Edit and Remove, and a
// row of buttons that add.
//
// It has no text input. An entry that genuinely has to be typed — an email
// address, for which no OS picker exists — comes from an action whose run()
// opens its own dialog, so "no free typing where something can be picked" is
// structural here rather than a rule each call site has to remember.
//
// Controlled, so the four call sites can differ in when they persist (a picker
// that saves on choice, a list with an explicit Save) without four copies of
// the list logic.

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsInlineError } from './settings-inline-error';
import { SettingsListRow } from './settings-list-row';

export interface EditableListItem {
  /** Stable identity — the path, the address, the channel id. */
  id: string;
  label: string;
  /** A second line: why a row is blocked, what it points at. */
  detail?: string;
  icon?: ReactNode;
  tone?: 'muted' | 'success' | 'warning' | 'destructive';
  canEdit?: boolean;
  canRemove?: boolean;
}

export interface EditableListAction {
  key: string;
  label: string;
  icon?: ReactNode;
  variant?: 'outline' | 'ghost' | 'secondary';
  /** The entries to add. An empty array means the person cancelled. */
  run: () => Promise<EditableListItem[]> | EditableListItem[];
}

const TONE: Record<NonNullable<EditableListItem['tone']>, string> = {
  muted: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export function EditableList({
  items,
  actions,
  onChange,
  onEdit,
  rowAction,
  empty,
  mono,
  busy,
  error,
}: {
  items: EditableListItem[];
  actions: EditableListAction[];
  onChange: (next: EditableListItem[]) => void;
  /** Re-pick or re-type one entry. Resolving null leaves the list alone. */
  onEdit?: (item: EditableListItem) => Promise<EditableListItem | null>;
  /** A trailing control of the call site's own, before Edit and Remove. */
  rowAction?: (item: EditableListItem) => ReactNode;
  empty?: ReactNode;
  mono?: boolean;
  busy?: boolean;
  error?: string;
}) {
  const [running, setRunning] = useState('');
  const [failure, setFailure] = useState('');

  const runAction = async (action: EditableListAction) => {
    setRunning(action.key);
    setFailure('');
    try {
      const added = await action.run();
      if (!added.length) return;
      const seen = new Set(items.map((i) => i.id));
      const fresh = added.filter((i) => i.id && !seen.has(i.id));
      if (fresh.length) onChange([...items, ...fresh]);
    } catch (e) {
      // A picker that throws has to say so somewhere; the alternative is an
      // unhandled rejection and a button that quietly did nothing.
      setFailure((e as Error).message);
    } finally {
      setRunning('');
    }
  };

  const edit = async (item: EditableListItem) => {
    if (!onEdit) return;
    const next = await onEdit(item);
    if (!next || !next.id) return;
    onChange(
      items
        .map((existing) => (existing.id === item.id ? next : existing))
        // A re-pick that lands on an entry already in the list collapses onto it.
        .filter((existing, index, all) => all.findIndex((o) => o.id === existing.id) === index),
    );
  };

  return (
    <div className="w-full space-y-2">
      {(error || failure) && <SettingsInlineError message={error || failure} />}
      {items.length === 0 && empty && (
        <div className="px-4 py-3 text-[12px] text-muted-foreground font-body">{empty}</div>
      )}
      {items.length > 0 && (
        <div className="rounded-lg border border-border/60 divide-y divide-border/40">
          {items.map((item) => (
            <SettingsListRow
              key={item.id}
              leading={item.icon}
              trailing={
                <>
                  {rowAction?.(item)}
                  {onEdit && item.canEdit !== false && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${item.label}`}
                      disabled={busy}
                      onClick={() => void edit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  {item.canRemove !== false && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item.label}`}
                      disabled={busy}
                      onClick={() => onChange(items.filter((existing) => existing.id !== item.id))}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </>
              }
            >
              <div
                className={cn(
                  'truncate text-[13px] text-foreground',
                  mono && 'font-mono text-[12px]',
                )}
              >
                {item.label}
              </div>
              {item.detail && (
                <div className={cn('truncate text-[11px]', TONE[item.tone ?? 'muted'])}>
                  {item.detail}
                </div>
              )}
            </SettingsListRow>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant={action.variant ?? 'outline'}
              size="sm"
              disabled={busy || running === action.key}
              onClick={() => void runAction(action)}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
