'use client';

// Setup — the provider wizard, re-runnable from settings. The flow itself
// (provider → credential → model) is shared with the first-run onboarding
// wizard: state in use-provider-setup, panes in provider-setup-flow.

import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { useProviderSetup, type ProviderPhase } from '@/hooks/yeaboi/use-provider-setup';
import { ProviderSetupFlow } from '@/components/yeaboi/provider-setup-flow';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

const STEPS: { phase: ProviderPhase; name: string }[] = [
  { phase: 'pick', name: 'Provider' },
  { phase: 'credential', name: 'Credential' },
  { phase: 'model', name: 'Model' },
  { phase: 'saved', name: 'Done' },
];

function SetupBody() {
  const flow = useProviderSetup();
  const stepIndex = STEPS.findIndex((s) => s.phase === flow.phase);

  return (
    <div>
      <h1 className="font-display text-2xl text-foreground mb-4">Setup</h1>
      <nav className="flex items-center gap-1.5 mb-6">
        {STEPS.map(({ name }, i) => (
          <span
            key={name}
            className={`rounded-full px-3 py-1 text-[11px] font-body ${
              i === stepIndex
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : i < stepIndex
                  ? 'bg-success/10 text-success'
                  : 'bg-secondary/60 text-muted-foreground/60'
            }`}
          >
            {i + 1}. {name}
          </span>
        ))}
      </nav>

      <ProviderSetupFlow flow={flow} />

      {flow.phase === 'saved' && flow.provider && (
        <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
          <h2 className="text-[13px] font-body font-medium text-foreground mb-3">You're set</h2>
          <div className="flex items-center gap-3">
            <DuckMark state="joined" size={56} />
            <p className="text-[13px] text-foreground">
              {flow.provider.full_name} · <code className="font-mono">{flow.chosenModel}</code>
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Link href="/home">
              <Button size="sm">Go to Home</Button>
            </Link>
            <Link href="/settings/credentials">
              <Button variant="outline" size="sm">
                Open Settings
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <SetupBody />
      </BackendGate>
    </PageShell>
  );
}
