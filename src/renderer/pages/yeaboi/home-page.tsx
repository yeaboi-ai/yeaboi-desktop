'use client';

// Home — the active world's welcome screen. The shell lives in one audience
// at a time (AudienceProvider), so "home" is home of the current world: the
// Solo and Team landings fork project workspace vs one-off session (sharing
// one component — the audience trims the mode grid and a little copy), the
// Agents landing is the agentwatch family.

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useAudience } from '@/components/providers/audience-provider';
import { WorkspaceHome } from './home/workspace-home';
import { AgentsHome } from './home/agents-home';

export default function HomePage() {
  const { audience } = useAudience();
  return (
    <BackendGate>
      {/* No page heading: the dashboard names itself, and the deck gives every
          surface the whole window — a second title above it is a title for the
          frame rather than for what is in it. */}
      {audience === 'agents' ? (
        <div className="mx-auto max-w-5xl px-6 py-10 pb-64">
          <AgentsHome />
        </div>
      ) : (
        <WorkspaceHome audience={audience} />
      )}
    </BackendGate>
  );
}
