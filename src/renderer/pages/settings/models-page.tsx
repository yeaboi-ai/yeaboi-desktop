'use client';

import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import { ModelsTab } from '@/components/settings/tabs/models-tab';

export default function ModelsSettingsPage() {
  return (
    <SettingsPageShell active="/settings/models">
      <ModelsTab />
    </SettingsPageShell>
  );
}
