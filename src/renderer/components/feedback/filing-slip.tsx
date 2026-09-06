'use client';

// The filing slip: what is about to be published, where, and by which route.
//
// Set in --font-code throughout, which globals.css reserves for "Data, not
// prose" — this is the issue's metadata, not writing. It states facts the
// backend served rather than guesses: the repo, the resolved title, the labels
// GitHub will see, and which of submit_feedback's two paths Submit will take.

import * as React from 'react';
import {
  attachmentSummary,
  issueLabels,
  issueTitle,
  routeSentence,
  type Attachment,
  type FeedbackOptions,
} from '@/lib/yeaboi/feedback';
import { cn } from '@/lib/utils';

/** The one accent on the page, chosen by the type — the most consequential field. */
export const TYPE_TONES: Record<string, string> = {
  Bug: 'var(--destructive)',
  Feature: 'var(--primary)',
  Improvement: 'var(--info)',
  Other: 'var(--muted-foreground)',
};

export function toneFor(kind: string): string {
  return TYPE_TONES[kind] ?? 'var(--muted-foreground)';
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground/70 uppercase">
        {label}
      </p>
      <div className="font-mono text-[11.5px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function FilingSlip({
  options,
  kind,
  area,
  title,
  attachments,
  actions,
  className,
}: {
  options: FeedbackOptions;
  kind: string;
  area: string;
  title: string;
  attachments: Attachment[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const tone = toneFor(kind);
  const [typeLabel, areaLabel] = issueLabels(kind, area);
  const areaColor = options.area_colors?.[area];
  const summary = attachmentSummary(attachments);
  const written = title.trim().length > 0;

  return (
    <aside
      aria-label="What will be filed"
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl bg-secondary/40 ring-1 ring-border/60',
        className,
      )}
    >
      {/* The type, marked on the slip itself rather than described. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: tone }}
      />

      <div className="flex min-h-0 flex-1 flex-col space-y-5 py-5 pr-5 pl-6">
        <p className="font-mono text-[9.5px] tracking-[0.18em] text-muted-foreground uppercase">
          Will be filed as
        </p>

        <Line label="Repository">
          <span className="break-all">{options.repo}</span>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">public — anyone can read it</p>
        </Line>

        <Line label="Title">
          <span className={cn('break-words', !written && 'text-muted-foreground/50')}>
            {written ? issueTitle(kind, title) : `[${kind}] your title`}
          </span>
        </Line>

        <Line label="Labels">
          <div className="flex flex-wrap gap-1.5">
            <span
              className="rounded px-1.5 py-0.5 text-[10.5px] ring-1"
              style={{ color: tone, borderColor: tone, boxShadow: `inset 0 0 0 1px ${tone}` }}
            >
              {typeLabel}
            </span>
            {/* The area carries its colour only as the dot the picker uses.
                Tinting the whole chip makes it compete with the type, which is
                the one accent this page spends. */}
            <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground ring-1 ring-border/60">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: areaColor ?? 'var(--muted-foreground)' }}
              />
              {areaLabel}
            </span>
          </div>
        </Line>

        {summary && (
          <Line label="Attached">
            <span>{summary}</span>
          </Line>
        )}

        {(options.version || options.platform) && (
          <Line label="Sent from">
            <span className="break-words text-muted-foreground">
              {['yeaboi v' + options.version, options.platform].filter(Boolean).join(' · ')}
            </span>
          </Line>
        )}

        {/* What it does and the button that does it sit at the foot, so a slip
            stretched beside a taller composer keeps them there. */}
        <div className="mt-auto border-t border-border/50 pt-4">
          <p className="font-body text-[12px] leading-relaxed text-muted-foreground">
            {routeSentence(options)}
          </p>
          {actions && <div className="mt-3 space-y-2">{actions}</div>}
        </div>
      </div>
    </aside>
  );
}
