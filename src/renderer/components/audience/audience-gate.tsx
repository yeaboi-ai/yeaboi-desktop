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
  const { chosen, soloEnabled, soloKnown, setAudience } = useAudience();

  // On a first run, wait for the sidecar rather than flashing the shell and
  // then covering it with a chooser a beat later.
  if (!chosen && !soloKnown) return null;
  // One world is not a question worth asking.
  if (!soloEnabled) return <>{children}</>;
  if (!chosen) return <AudienceChooser onChoose={setAudience} />;
  return <>{children}</>;
}
