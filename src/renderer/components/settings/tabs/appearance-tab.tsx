import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { AppearanceSection } from './general/appearance-section';
import { ScreensaverSection } from './general/screensaver-section';

export function AppearanceTab() {
  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader
          title="Appearance"
          subtitle="Color scheme, theme presets, and brand customization"
        />
        <div className="px-5 py-5">
          <AppearanceSection />
        </div>
      </SettingsCard>
      <SettingsCard index={1}>
        <SettingsSectionHeader
          title="Screensaver"
          subtitle="What the window shows when you have been away"
        />
        <div className="px-5 py-5">
          <ScreensaverSection />
        </div>
      </SettingsCard>
    </div>
  );
}
