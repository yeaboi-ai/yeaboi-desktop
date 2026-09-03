'use client';

// The setup route, kept so a deep link and Niko's own navigation still land
// somewhere. The wizard itself lives on the poker surface — this is the same
// panel with nothing around it.

import { useNavigate } from 'react-router';

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { PokerSetup } from '@/components/yeaboi/poker-setup';
import { Surface } from '@/components/yeaboi/surface';

export default function PokerSetupPage() {
  const navigate = useNavigate();
  return (
    <BackendGate>
      <Surface>
        <div className="space-y-4">
          <header>
            <h1 className="font-display text-2xl text-foreground">New poker session</h1>
            <p className="mt-1 font-body text-[13px] text-muted-foreground">
              Pick where the tickets come from; the table opens on the poker screen.
            </p>
          </header>
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <PokerSetup onOpened={() => navigate('/team/poker')} />
          </section>
        </div>
      </Surface>
    </BackendGate>
  );
}
