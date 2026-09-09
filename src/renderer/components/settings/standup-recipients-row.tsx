// Who the standup emails, as rows rather than a comma-separated string.
//
// This is the one editor where typing survives, and deliberately: there is no
// OS picker for an email address. It comes from a dialog rather than an inline
// box so the list itself stays button-driven, and so an entry is validated
// before it can join the list.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditableList, type EditableListItem } from '@/components/settings/primitives';
import { isEmailish, splitCsv } from '@/lib/settings/list-edit';
import { type SettingField, saveList } from '@/lib/yeaboi/settings';

const asItem = (address: string): EditableListItem => ({ id: address, label: address });

/** One address, typed. Resolves '' when dismissed. */
function AddressDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: string;
  onClose: (address: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const problem = value.trim() && !isEmailish(value) ? 'That is not an email address.' : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose('')}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit recipient' : 'Add recipient'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem && value.trim()) onClose(value.trim());
          }}
        >
          <Input
            autoFocus
            value={value}
            placeholder="name@team.com"
            aria-label="Email address"
            onChange={(event) => setValue(event.target.value)}
          />
          {problem && (
            <p role="alert" className="mt-1.5 text-[11px] text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onClose('')}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={Boolean(problem) || !value.trim()}>
              {initial ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StandupRecipientsRow({
  field,
  onSaved,
}: {
  field: SettingField;
  onSaved: (message: string) => void;
}) {
  const stored = field.items ?? splitCsv(field.value);
  const [items, setItems] = useState<EditableListItem[]>(stored.map(asItem));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One dialog, two jobs: `asking` holds the resolver the list is waiting on.
  const [asking, setAsking] = useState<{ initial: string; resolve: (v: string) => void } | null>(
    null,
  );

  const ask = (initial: string) =>
    new Promise<string>((resolve) => setAsking({ initial, resolve }));

  const persist = (next: EditableListItem[]) => {
    const previous = items;
    setItems(next);
    setBusy(true);
    setError('');
    void saveList(
      field,
      next.map((i) => i.id),
    ).then(
      (result) => {
        setBusy(false);
        onSaved(result.message);
      },
      (e: Error) => {
        // The engine validates each address, so a refusal is expected rather
        // than exceptional — the rows must not keep one it rejected.
        setItems(previous);
        setBusy(false);
        setError(e.message);
      },
    );
  };

  return (
    <div className="mt-1">
      <EditableList
        items={items}
        busy={busy}
        error={error}
        empty="No recipients — email delivery is skipped."
        onChange={persist}
        onEdit={async (item) => {
          const next = await ask(item.id);
          return next ? asItem(next) : null;
        }}
        actions={[
          {
            key: 'add',
            label: 'Add recipient…',
            icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" />,
            run: async () => {
              const next = await ask('');
              return next ? [asItem(next)] : [];
            },
          },
        ]}
      />
      <AddressDialog
        key={asking?.initial ?? 'closed'}
        open={Boolean(asking)}
        initial={asking?.initial ?? ''}
        onClose={(address) => {
          asking?.resolve(address);
          setAsking(null);
        }}
      />
    </div>
  );
}
