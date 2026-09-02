'use client';

// The one-time audience gate. While the question was never answered, the
// chooser is the whole window — the shell and its chrome stay unmounted.
// Deliberately not a route, like the onboarding wizard, so deep links cannot
// skip it; the router still navigates underneath and the target route is
// simply revealed after the choice.

import type { ReactNode } from 'react';
import { useAudience } from '@/components/providers/audience-provider';
import { AudienceChooser } from './audience-chooser';

export function AudienceGate({ children }: { children: ReactNode }) {
  const { chosen, setAudience } = useAudience();

  if (!chosen) return <AudienceChooser onChoose={setAudience} />;
  return <>{children}</>;
}
