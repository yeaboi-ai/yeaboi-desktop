'use client';

import { useState } from 'react';
import { Check, ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import type { OutputCatalogueEntry } from '@/hooks/use-project-outputs';
import { OUTPUT_TYPES, type OutputType } from './output-types';

interface DeliverableCardProps {
  entry: OutputCatalogueEntry;
  onGenerate: (outputType: OutputType, payload?: Record<string, unknown>) => Promise<unknown>;
}

function statusBadge(status: OutputCatalogueEntry['status'], implemented: boolean) {
  if (!implemented) {
    return <span className="text-[10px] uppercase tracking-wide text-white/30">coming soon</span>;
  }
  switch (status) {
    case 'not_generated':
      return (
        <span className="text-[10px] uppercase tracking-wide text-white/40">not generated</span>
      );
    case 'generating':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-300/90">
          <Loader2 className="h-3 w-3 animate-spin" /> generating
        </span>
      );
    case 'ready':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90">
          <Check className="h-3 w-3" /> ready
        </span>
      );
    case 'failed':
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-red-400/90">
          <X className="h-3 w-3" /> failed
        </span>
      );
  }
}

function artifactLink(entry: OutputCatalogueEntry): { href: string; label: string } | null {
  const a = entry.artifacts;
  if (!a) return null;
  if (typeof a.repo_url === 'string' && a.repo_url) {
    return { href: a.repo_url, label: (a.repo_name as string) || 'Repository' };
  }
  return null;
}

export function DeliverableCard({ entry, onGenerate }: DeliverableCardProps) {
  const meta = OUTPUT_TYPES[entry.output_type];
  const Icon = meta.icon;
  const [submitting, setSubmitting] = useState(false);
  const disabled = !entry.implemented || submitting || entry.status === 'generating';
  const link = artifactLink(entry);

  const cta =
    entry.status === 'ready' ? 'Regenerate' : entry.status === 'failed' ? 'Retry' : 'Generate';

  const onClick = async () => {
    setSubmitting(true);
    try {
      await onGenerate(entry.output_type);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
            <Icon className="h-4 w-4 text-white/70" />
          </span>
          <div>
            <div className="text-sm font-medium text-white/90">{meta.label}</div>
            <div className="text-[11px] leading-tight text-white/50">{meta.short_description}</div>
          </div>
        </div>
        {statusBadge(entry.status, entry.implemented)}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400/80 to-emerald-400/80"
            style={{ width: `${entry.maturity}%` }}
          />
        </div>
        <span className="w-10 text-right text-[10px] tabular-nums text-white/50">
          {entry.maturity}%
        </span>
      </div>

      <div className="flex items-center justify-between">
        {link ? (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white"
          >
            {link.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-[11px] text-white/30">No artifact yet</span>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {cta}
        </button>
      </div>
    </div>
  );
}
