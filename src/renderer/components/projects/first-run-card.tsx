'use client';

// What a project shows before anything has happened inside it: one card saying
// where the description went and offering the conversation that opens with it,
// in place of a dashboard whose every panel is empty. The engine modes are
// still here, one quiet line down, for a reader who wants them first.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { DESCRIBE_COPY } from '@/lib/yeaboi/describe';

export interface FirstRunCardProps {
  projectId: string;
  /** False on a borrowed project: the rest of the page withholds the offer too. */
  canStart: boolean;
  /** The engine modes, revealed under the quiet line. */
  children: React.ReactNode;
}

export function FirstRunCard({ projectId, canStart, children }: FirstRunCardProps) {
  const [modesOpen, setModesOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card px-8 py-6 animate-slide-up stagger-3">
      <h2 className="font-display text-2xl italic leading-tight text-foreground">
        {DESCRIBE_COPY.CARD_TITLE}
      </h2>
      <p className="mt-3 max-w-xl text-[13px] font-body leading-relaxed text-muted-foreground">
        {DESCRIBE_COPY.CARD_BODY}
      </p>
      {canStart && (
        <div className="mt-5">
          <Link
            href={`/projects/${projectId}/sessions/new`}
            className={buttonVariants({ size: 'sm', className: 'font-body' })}
          >
            {DESCRIBE_COPY.CARD_ACTION}
            <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      )}
      <div className="mt-5 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setModesOpen((open) => !open)}
          aria-expanded={modesOpen}
          aria-controls="first-run-modes"
          className="text-[12px] font-body text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {DESCRIBE_COPY.CARD_MODES}
        </button>
        {modesOpen && (
          <div id="first-run-modes" className="mt-4 animate-fade-in">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
