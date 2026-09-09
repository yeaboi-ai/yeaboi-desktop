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
  const { chosen, soloEnabled, setAudience } = useAudience();

  // One world is not a question worth asking, and until the sidecar says
  // otherwise there is one: a first run must never hold a blank window for the
  // length of a Python boot, so the shell shows and the chooser arrives with
  // the answer if there turns out to be a choice.
  if (!soloEnabled || chosen) return <>{children}</>;
  return <AudienceChooser onChoose={setAudience} />;
}
