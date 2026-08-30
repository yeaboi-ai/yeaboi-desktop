'use client';

// The finished plan, standalone. The body moved to
// components/projects/plan-panel.tsx so the project Plan tab renders the
// same thing; this page survives only until /humans/planning retires.

import { useSearchParams } from 'react-router';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { PlanPanel } from '@/components/projects/plan-panel';

export default function PlanPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('id') ?? '';
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PlanPanel key={sessionId} sessionId={sessionId} />
      </div>
    </BackendGate>
  );
}
