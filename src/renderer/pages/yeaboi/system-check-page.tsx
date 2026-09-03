'use client';

// System Check — which optional features are ready on this machine, from
// GET /api/system/check. Every probe behind it is offline by the backend's
// policy (filesystem/PATH/config or loopback only), so opening the page and
// re-running the check cause no egress — the promise the Privacy page makes,
// kept here too.
//
// Rows are sectioned by the payload's own `categories` — the areas a person
// fixes one at a time — and each section carries its own readiness, so a
// machine with one broken area does not read as a wall of equal rows. Icons are
// chosen here: the wire carries keys and titles, never presentation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cable,
  CheckCircle2,
  Circle,
  Cpu,
  HardDrive,
  HelpCircle,
  Package,
  RefreshCw,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import {
  groupChecks,
  needsAttention,
  type Check,
  type CheckStatus,
  type Report,
} from '@/lib/yeaboi/system-check';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import {
  PostureStrip,
  type PostureCell,
  type PostureTone,
} from '@/components/yeaboi/posture-strip';
import { cn } from '@/lib/utils';

const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />,
  missing: <Circle className="h-4 w-4 shrink-0 text-warning" />,
  unsupported: <XCircle className="h-4 w-4 shrink-0 text-destructive" />,
  unknown: <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />,
};

const STATUS_TONE: Record<CheckStatus, PostureTone> = {
  ok: 'good',
  missing: 'warn',
  unsupported: 'bad',
  unknown: 'idle',
};

// One mark per category key, mirroring the terminal page's glyph vocabulary.
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai: Sparkles,
  integrations: Cable,
  tools: Terminal,
  packages: Package,
  machine: HardDrive,
};

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Cpu;
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-foreground/70 ring-1 ring-border/40"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function toCells(checks: Check[]): PostureCell[] {
  return checks.map((check) => ({
    key: check.key,
    tone: STATUS_TONE[check.status] ?? 'idle',
    title: `${check.label} — ${check.detail || check.status}`,
  }));
}

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5">{STATUS_ICON[check.status] ?? STATUS_ICON.unknown}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-body font-medium text-foreground">
          {check.label}
          {check.feature && (
            <span className="ml-2 text-[11px] font-body text-muted-foreground/70">
              {check.feature}
            </span>
          )}
        </p>
        {check.detail && <p className="mt-0.5 text-[12px] text-muted-foreground">{check.detail}</p>}
        {check.hint && (
          <p className="mt-1 text-[12px] text-foreground/80">
            <span aria-hidden className="mr-1 text-muted-foreground/60">
              →
            </span>
            {check.hint}
          </p>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 font-body text-[11px] transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        active
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function SystemCheckBody() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);

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

  const attention = useMemo(() => needsAttention(report?.checks ?? []), [report]);
  const sections = useMemo(
    () => (report ? groupChecks(report, attentionOnly) : []),
    [report, attentionOnly],
  );

  const header = (
    <header className="mb-7 flex items-start justify-between gap-4">
      <p className="text-[13px] text-muted-foreground">
        {report?.summary ?? 'Every row is optional. The app itself needs none of them.'}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary/80 disabled:opacity-50"
      >
        <RefreshCw
          className={cn('h-3.5 w-3.5', running && 'animate-spin motion-reduce:animate-none')}
        />
        Re-run
      </button>
    </header>
  );

  if (error)
    return (
      <>
        {header}
        <p className="text-[13px] text-muted-foreground">
          {/404|not found/i.test(error)
            ? 'Your yeaboi backend predates System Check — update yeaboi to run it.'
            : `Could not run the system check: ${error}`}
        </p>
      </>
    );

  if (!report)
    return (
      <>
        {header}
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary/50" />
          ))}
        </div>
      </>
    );

  return (
    <>
      {header}
      <div className="mb-6 space-y-3">
        <PostureStrip
          cells={toCells(report.checks)}
          label={report.summary}
          className="animate-fade-in motion-reduce:animate-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!attentionOnly} onClick={() => setAttentionOnly(false)}>
            All {report.checks.length}
          </FilterChip>
          <FilterChip active={attentionOnly} onClick={() => setAttentionOnly(true)}>
            Needs attention {attention.length}
          </FilterChip>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {attentionOnly
            ? 'Nothing needs your attention — every check came back ready.'
            : 'This backend reported no checks.'}
        </p>
      ) : (
        <div className="space-y-4">
          {/* The header counts describe the whole category; `rows` is what the
              filter left to render. */}
          {sections.map(({ category, rows, ok, total }, index) => (
            <SettingsCard key={category.key || 'all'} index={index}>
              <SettingsSectionHeader
                title={category.title}
                subtitle={category.blurb}
                icon={<CategoryIcon category={category.key} />}
                action={
                  <div className="w-24 space-y-1.5 text-right">
                    <p className="font-body text-[11px] text-muted-foreground">
                      {ok}/{total} ready
                    </p>
                    <PostureStrip
                      cells={toCells(rows)}
                      label={`${ok} of ${total} ready in ${category.title}`}
                    />
                  </div>
                }
              />
              <div className="divide-y divide-border/40">
                {rows.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </>
  );
}

export default function SystemCheckPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 pb-28">
      <header className="mb-7">
        <h1 className="font-display text-[40px] leading-none text-foreground">System check</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">What is ready on this machine.</p>
      </header>
      <BackendGate>
        <SystemCheckBody />
      </BackendGate>
    </div>
  );
}
