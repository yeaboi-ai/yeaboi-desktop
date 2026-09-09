// The sandbox whitelist, edited with the OS picker rather than typed.
//
// Every entry grants the agent read *and* write, and the editor replaces the
// list wholesale — which is why Save stays explicit and the card stays open
// (see the note in system-panel.tsx). Multi-select makes it one drag to grant
// twelve folders, so nothing here saves on pick.
//
// Edit re-picks as a folder: the stored list is a comma-joined string with no
// per-entry kind, so which dialog a row came from is not recoverable. A file
// row re-picked as a folder is one click to undo.

import { useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type SettingField, saveAllowedPaths } from '@/lib/yeaboi/settings';
import { splitCsv } from '@/lib/settings/list-edit';
import {
  EditableList,
  type EditableListItem,
  RowValue,
  SettingRow,
} from '@/components/settings/primitives';

const asItem = (path: string): EditableListItem => ({ id: path, label: path });

async function pick(kind: 'file' | 'folder', title: string): Promise<EditableListItem[]> {
  const { paths } = await window.yeaboi.pickPaths({ kind, multi: true, title });
  return paths.map(asItem);
}

export function AllowedPathsRow({
  field,
  onSaved,
}: {
  field: SettingField;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EditableListItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = () => {
    setItems(splitCsv(field.value).map(asItem));
    setError('');
    setOpen(true);
  };

  const save = () => {
    setBusy(true);
    void saveAllowedPaths(items.map((i) => i.id)).then(
      (result) => {
        setBusy(false);
        setOpen(false);
        onSaved(result.message);
      },
      (e: Error) => {
        setBusy(false);
        setError(e.message);
      },
    );
  };

  if (!open) {
    // One path per line. Joined, three of these wrap into a paragraph nobody
    // can read an entry out of — and each one is a grant worth being able to
    // count at a glance.
    const saved = field.items ?? splitCsv(field.value);
    return (
      <SettingRow label={field.label}>
        {saved.length === 0 ? (
          <RowValue value="" fallback="none — sandboxed to the data directory" />
        ) : (
          <ul className="min-w-0 flex-1 space-y-1">
            {saved.map((path) => (
              <li key={path} className="flex min-w-0 items-baseline gap-2">
                <span aria-hidden className="shrink-0 text-muted-foreground/50">
                  •
                </span>
                <span className="min-w-0 font-mono text-[12px] break-all text-foreground">
                  {path}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" onClick={begin}>
          Edit
        </Button>
      </SettingRow>
    );
  }

  return (
    <SettingRow label={field.label}>
      <div className="w-full space-y-2">
        <EditableList
          mono
          items={items}
          busy={busy}
          error={error}
          empty="Nothing beyond the data directory yet."
          onChange={setItems}
          onEdit={async (item) => {
            const { paths } = await window.yeaboi.pickPaths({
              kind: 'folder',
              multi: false,
              title: 'Allow a folder',
              defaultPath: item.id,
            });
            return paths[0] ? asItem(paths[0]) : null;
          }}
          actions={[
            {
              key: 'folder',
              label: 'Add folder…',
              icon: <Folder className="h-3.5 w-3.5" aria-hidden="true" />,
              run: () => pick('folder', 'Allow folders'),
            },
            {
              key: 'file',
              label: 'Add file…',
              icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />,
              run: () => pick('file', 'Allow files'),
            },
          ]}
        />
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" disabled={busy} onClick={save}>
            Save
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </SettingRow>
  );
}
