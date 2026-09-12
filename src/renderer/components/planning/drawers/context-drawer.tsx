'use client';

// What this plan reads from, changed after the fact: the same picker the
// composer showed, seeded from the scope the plan was made under, saved back
// onto the plan. The plan's own labels are not the filter and stay as they
// are. A sidecar without the context routes draws one sentence instead.

import { useEffect, useRef, useState } from 'react';
import { ContextPicker } from '@/components/context/context-picker';
import { Button } from '@/components/ui/button';
import {
  defaultScope,
  scopeFromWire,
  serializeScope,
  type ContextOptions,
  type ContextScope,
} from '@/lib/context/scope';
import { updateChat, type SessionView } from '@/lib/yeaboi/chat';
import { loadContextOptions, loadLabels } from '@/lib/yeaboi/context';

export function ContextDrawer({
  sessionId,
  view,
  onSaved,
}: {
  sessionId: string;
  view: SessionView | null;
  onSaved: (patch: { project_label: string; tags: string[] }) => void;
}) {
  const [options, setOptions] = useState<ContextOptions | null | 'unread'>('unread');
  const [scope, setScope] = useState<ContextScope>(() => defaultScope(null));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  // The view is re-read after every turn; the seed reads it once, so a scope
  // being edited is not overwritten mid-edit.
  const seedView = useRef(view);
  seedView.current = view;

  useEffect(() => {
    let live = true;
    Promise.all([
      loadContextOptions('planning'),
      loadLabels('planning', sessionId).catch(() => null),
    ]).then(
      ([loaded, labels]) => {
        if (!live) return;
        setOptions(loaded);
        const next = scopeFromWire(labels?.scope, loaded);
        const seed = seedView.current;
        const project = labels?.project_label || seed?.project_label || '';
        setScope({ ...next, projects: project ? [project] : next.projects });
      },
      () => live && setOptions(null),
    );
    return () => {
      live = false;
    };
  }, [sessionId]);

  if (options === 'unread') return <p className="text-[13px] text-muted-foreground">Reading…</p>;
  if (!options) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This sidecar has no context routes yet; the plan reads everything.
      </p>
    );
  }

  async function save() {
    if (!options || options === 'unread') return;
    setSaving(true);
    setNote('');
    try {
      const saved = await updateChat(sessionId, {
        context: serializeScope(scope, options.defaults?.tags ?? []),
        projectLabel: (scope.projects[0] ?? '').trim(),
      });
      onSaved({ project_label: saved.project_label, tags: saved.tags });
      setNote('Saved. The next turn reads under this.');
    } catch (e) {
      setNote((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <ContextPicker mode="planning" options={options} scope={scope} onChange={setScope} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted-foreground">{note}</span>
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
