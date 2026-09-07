'use client';

// The duck's quips — the one duck preference that is not shell-local.
//
// It sits with the rest of what he says because that is where a person looks
// for anything duck, but it writes the shared config rather than this window's
// settings.json: a duck muted in the terminal is muted here too. Renders
// nothing when the backend is not up, so the Duck tab still works without it.

import { useEffect, useState } from 'react';
import { type SettingField, loadSettings, saveSetting } from '@/lib/yeaboi/settings';
import { ChoicePills, SettingsListRow } from './primitives';

export function DuckQuipsRow() {
  const [field, setField] = useState<SettingField | null>(null);

  const refresh = () =>
    loadSettings().then(
      (snap) => setField(snap.fields.find((f) => f.env === 'DUCK_ENABLED') ?? null),
      () => setField(null),
    );
  useEffect(() => {
    void refresh();
  }, []);

  if (!field) return null;

  return (
    <SettingsListRow
      trailing={
        <ChoicePills
          options={field.choices}
          active={field.active_choice}
          labels={field.choice_labels}
          onPick={(value) => void saveSetting(field.env, value).then(refresh, refresh)}
        />
      }
    >
      <div className="text-sm font-medium">Quips</div>
      <div className="text-xs text-muted-foreground">
        His remarks as he works — shared with the terminal, so muting him here mutes him there
      </div>
    </SettingsListRow>
  );
}
