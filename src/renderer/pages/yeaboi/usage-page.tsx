'use client';

// Usage — lifetime LLM spend, served by the usage_get tool (the same numbers
// the TUI's Usage page reads from the token_usage table).

import { useEffect, useState } from 'react';
import { callTool } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';

interface UsageData {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  call_count: number;
  note?: string;
}

const fmt = (n: number) => n.toLocaleString('en-US');

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4">
      <p className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-display text-foreground mt-1">{value}</p>
    </div>
  );
}

function UsageBody() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callTool<UsageData>('usage_get').then(
      (envelope) => {
        if (!envelope.ok) {
          setError(envelope.error?.message ?? 'usage_get failed');
          return;
        }
        setUsage(envelope.data);
        setWarnings(envelope.warnings);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error)
    return <p className="text-[13px] text-muted-foreground">Could not load usage: {error}</p>;
  if (!usage) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="LLM calls" value={fmt(usage.call_count)} />
        <StatTile label="Input tokens" value={fmt(usage.input_tokens)} />
        <StatTile label="Output tokens" value={fmt(usage.output_tokens)} />
        <StatTile label="Total tokens" value={fmt(usage.total_tokens)} />
      </div>
      {usage.note && <p className="mt-4 text-[12px] text-muted-foreground">{usage.note}</p>}
      {warnings.map((w) => (
        <p key={w} className="mt-1 text-[12px] text-muted-foreground/70">
          {w}
        </p>
      ))}
    </>
  );
}

export default function UsagePage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">Usage</h1>
        <UsageBody />
      </div>
    </BackendGate>
  );
}
