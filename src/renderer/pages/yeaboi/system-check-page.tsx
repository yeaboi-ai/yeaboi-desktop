'use client';

// System Check — which optional features are ready on this machine, from
// GET /api/system/check. Every probe behind it is offline by the backend's
// policy (filesystem/PATH/config or loopback only), so opening the page and
// re-running the check cause no egress — the promise the Privacy page makes,
// kept here too.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, HelpCircle, RefreshCw, XCircle } from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';

interface Check {
  key: string;
  label: string;
  status: 'ok' | 'missing' | 'unsupported' | 'unknown';
  detail: string;
  hint: string;
  feature: string;
}

interface Report {
  summary: string;
  checks: Check[];
}

const STATUS_ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />,
  missing: <Circle className="h-4 w-4 text-warning shrink-0 mt-0.5" />,
  unsupported: <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />,
  unknown: <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />,
} as const;

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 flex items-start gap-3">
      {STATUS_ICON[check.status] ?? STATUS_ICON.unknown}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">
          {check.label}
          {check.feature && (
            <span className="ml-2 text-[11px] font-body text-muted-foreground/70">
              {check.feature}
            </span>
          )}
        </p>
        {check.detail && <p className="text-[12px] text-muted-foreground mt-0.5">{check.detail}</p>}
        {check.hint && <p className="text-[12px] text-foreground/80 mt-1">{check.hint}</p>}
      </div>
    </div>
  );
}

function SystemCheckBody() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    apiGet<Report>('/api/system/check').then(
      (payload) => {
        setReport(payload);
        setError(null);
        setRunning(false);
      },
      (e: Error) => {
        setError(e.message);
        setRunning(false);
      },
    );
  }, []);

  useEffect(run, [run]);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        {/404|not found/i.test(error)
          ? 'Your yeaboi backend predates System Check — update yeaboi to run it.'
          : `Could not run the system check: ${error}`}
      </p>
    );
  if (!report) return <p className="text-[13px] text-muted-foreground">Checking…</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-muted-foreground">{report.summary}</p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
          Re-run
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {report.checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </div>
    </>
  );
}

export default function SystemCheckPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">System Check</h1>
        <SystemCheckBody />
      </div>
    </BackendGate>
  );
}
