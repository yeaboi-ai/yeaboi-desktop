'use client';

import { useSettingsTab } from '@/hooks/use-settings-tab';
import { SettingsShell } from '@/components/settings/settings-shell';
import { SettingsTabBar } from '@/components/settings/settings-sidebar';
import { SettingsHeader } from '@/components/settings/settings-header';
import { ProfileTab } from '@/components/settings/tabs/profile-tab';
import { AppearanceTab } from '@/components/settings/tabs/appearance-tab';
import { AITab } from '@/components/settings/tabs/ai-tab';
import { DuckTab } from '@/components/settings/tabs/duck-tab';

export default function SettingsPage() {
  const { tab, setTab } = useSettingsTab();

  return (
    <SettingsShell
      header={<SettingsHeader />}
      tabs={<SettingsTabBar active={tab} onChange={setTab} />}
    >
      <div
        key={tab}
        className="animate-fade-in motion-reduce:animate-none"
        style={{ animationDuration: '0.25s' }}
      >
        {tab === 'profile' && <ProfileTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'ai' && <AITab />}
        {tab === 'duck' && <DuckTab />}
      </div>
    </SettingsShell>
  );
}
