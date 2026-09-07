'use client';

// The duck's quips — the one duck preference that is not shell-local.
//
// It sits with the rest of what he says because that is where a person looks
// for anything duck, but it writes the shared config rather than this window's
// settings.json: a duck muted in the terminal is muted here too. Renders
// nothing when the backend is not up, so the Duck tab still works without it.

import { useEffect, useState } from 'react';
import { type SettingField, loadSettings, saveSetting } from '@/lib/yeaboi/settings';
import { SettingsListRow } from './primitives';
import { Switch } from '@/components/ui/switch';

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

  // The engine states this as a pair of choices; beside three switches it is
  // one too, so the row reads like the rows around it.
  const isOn = (choice: string) => /^(on|true|yes|enabled)$/i.test(choice);
  const on = isOn(field.active_choice);
  const pick = (next: boolean) => {
    const choice = field.choices.find((one) => isOn(one) === next);
    if (choice) void saveSetting(field.env, choice).then(refresh, refresh);
  };

  return (
    <SettingsListRow
      hoverable={false}
      trailing={<Switch checked={on} onCheckedChange={pick} aria-label="Quips" />}
    >
      <div className="text-sm font-medium">Quips</div>
      <div className="text-xs text-muted-foreground">
        His remarks as he works — shared with the terminal, so muting him here mutes him there
      </div>
    </SettingsListRow>
  );
}
