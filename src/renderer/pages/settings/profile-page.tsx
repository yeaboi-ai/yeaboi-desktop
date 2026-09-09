'use client';

import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import { ProfileTab } from '@/components/settings/tabs/profile-tab';

export default function ProfileSettingsPage() {
  return (
    <SettingsPageShell active="/settings/profile">
      <ProfileTab />
    </SettingsPageShell>
  );
}
