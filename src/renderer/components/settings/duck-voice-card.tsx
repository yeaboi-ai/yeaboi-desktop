'use client';

// The duck's speech bubble — the one duck preference that is not shell-local.
//
// It sits beside the pet's own settings because that is where a person looks
// for anything duck, but it writes the shared config rather than this window's
// settings.json: a duck muted in the terminal is muted here too. Renders
// nothing when the backend is not up, so the Duck tab still works without it.

import { useEffect, useState } from 'react';
import { type SettingField, loadSettings, saveSetting } from '@/lib/yeaboi/settings';
import { ChoicePills, SettingRow, SettingsCard, SettingsSectionHeader } from './primitives';

export function DuckVoiceCard() {
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
    <SettingsCard index={4}>
      <SettingsSectionHeader
        title="Speech bubble"
        subtitle="Shared with the terminal — mute it in one place and it is muted in both"
      />
      <div className="py-1.5">
        <SettingRow label="Quips">
          <ChoicePills
            options={field.choices}
            active={field.active_choice}
            labels={field.choice_labels}
            onPick={(value) => void saveSetting(field.env, value).then(refresh, refresh)}
          />
        </SettingRow>
      </div>
    </SettingsCard>
  );
}
