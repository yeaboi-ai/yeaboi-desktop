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
      {/* The tip dock and Niko's pill both float over the bottom of the window;
          the padding is what keeps the last card row reachable under them. The
          dock is 24 + 72 duck + 10, and a three-line bubble another ~112 — the
          common case at the 960px minimum width, not the edge. */}
      <div className="mx-auto max-w-5xl px-6 py-10 pb-64">
        <h1 className="font-display text-2xl text-foreground mb-6">Home</h1>
        {audience === 'agents' ? <AgentsHome /> : <WorkspaceHome audience={audience} />}
      </div>
    </BackendGate>
  );
}
