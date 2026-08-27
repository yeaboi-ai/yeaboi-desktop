import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { AIProviderSection } from './general/ai-provider-section';
import { GitHubSection } from './general/github-section';

export function AITab() {
  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader
          title="AI & orchestrator"
          subtitle="The model that powers chat + suggestions, and the GitHub credential the orchestrator uses to ship code"
        />
        <div className="px-5 py-5">
          <AIProviderSection />
        </div>
        <div className="border-t border-border/50 px-5 py-5">
          <GitHubSection />
        </div>
      </SettingsCard>
    </div>
  );
}
