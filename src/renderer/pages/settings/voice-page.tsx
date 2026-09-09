'use client';

import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import { VoiceTab } from '@/components/settings/tabs/voice-tab';

export default function VoiceSettingsPage() {
  return (
    <SettingsPageShell active="/settings/voice">
      <VoiceTab />
    </SettingsPageShell>
  );
}
