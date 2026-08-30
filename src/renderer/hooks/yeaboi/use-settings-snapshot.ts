// The settings snapshot as a hook: fields, masked secrets, help links. Used by
// the onboarding steps that render their inputs off the backend's own field
// registry, so an older engine simply yields fewer fields rather than errors.

import { useCallback, useEffect, useState } from 'react';
import { type SettingsSnapshot, loadSettings } from '@/lib/yeaboi/settings';

export function useSettingsSnapshot(enabled = true) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    loadSettings().then(setSnapshot, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { snapshot, error, refresh };
}
