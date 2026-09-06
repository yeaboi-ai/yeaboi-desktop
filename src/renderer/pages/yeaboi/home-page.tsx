'use client';

// Home — the active world's welcome screen. The shell lives in one audience
// at a time (AudienceProvider), so "home" is home of the current world: Solo
// and Team land on the dashboard, Agents on the agentwatch family.
//
// Nothing is fetched here — each surface reads its own data — so home arrives
// drawn rather than behind a "Loading…".

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useAudience } from '@/components/providers/audience-provider';
import { HomeDashboard } from './home/dashboard';
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
        /* Where the work stands. The modes are one scroll away in the deck, so
           this surface answers what happened and what is next rather than
           listing what can be launched. */
        <HomeDashboard />
      )}
    </BackendGate>
  );
}
