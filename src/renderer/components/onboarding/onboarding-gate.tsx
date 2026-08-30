'use client';

// The first-run gate. Main decides whether the wizard is needed (fresh machine
// vs an existing config); while it is, the wizard is the whole window — the
// shell, duck chrome and ambience stay unmounted. Deliberately not a route, so
// deep links cannot skip it and the route contract is untouched.

import { useEffect, useState, type ReactNode } from 'react';
import { OnboardingWizard } from './onboarding-wizard';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'unknown' | 'needed' | 'done'>('unknown');

  useEffect(() => {
    window.yeaboi.getOnboarding().then(
      ({ needed }) => setState(needed ? 'needed' : 'done'),
      () => setState('done'),
    );
  }, []);

  if (state === 'unknown') return null;
  if (state === 'needed') {
    return (
      <OnboardingWizard
        onFinished={async () => {
          // A failed persist only means the wizard returns next launch; the
          // session it gated proceeds either way.
          await window.yeaboi.completeOnboarding().catch(() => {});
          setState('done');
        }}
      />
    );
  }
  return <>{children}</>;
}
