'use client';

// A route that exists before its page does. The nav, the palette and the
// manifest all know these paths already; the honest thing to render while the
// mode's page is being built is the name and the fact, not a broken screen.

import { routeFor } from '@/lib/yeaboi/routes';
import { useLocation } from 'react-router';
import { Construction } from 'lucide-react';
import { BackendGate } from '@/components/yeaboi/backend-gate';

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const route = routeFor(pathname);
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-display text-2xl text-foreground mb-3">{route?.title ?? pathname}</h1>
        <div className="rounded-2xl bg-card ring-1 ring-border/60 p-5 flex items-start gap-3">
          <Construction className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[13px] text-muted-foreground leading-snug">
            This mode is on its way to the desktop. Until it lands here, the terminal has it:{' '}
            <code className="font-mono text-foreground">yeaboi</code>.
          </p>
        </div>
      </div>
    </BackendGate>
  );
}
