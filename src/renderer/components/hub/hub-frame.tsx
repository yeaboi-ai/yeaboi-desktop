'use client';

// A mode's hub: its name in the serif, one line under it, the one thing to
// do there as a plain link on the right, then its saved runs as a plain list
// (a name, a quiet detail, a day; hover a row to remove it), and the other
// ways in at the foot. The terminal's _run_mode_hub, drawn.

import { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { GhostSkeleton } from '@/components/ui/ghost-skeleton';
import { PersonaMascot } from '@/lib/audience/worlds';
import type { PageLink } from '@/lib/nav/sections';
import type { HubDescriptor, HubRow } from '@/lib/yeaboi/hubs';

export type HubRows = HubRow[] | 'loading' | 'error';

export interface HubFrameProps {
  hub: HubDescriptor;
  rows: HubRows;
  /** Called after a row was removed, so the list is read again. */
  onRemoved?: () => void;
  links?: readonly PageLink[];
}

function WayInRow({ link }: { link: PageLink }) {
  return (
    <li>
      <Link
        href={link.href}
        className="group grid gap-x-4 gap-y-0.5 py-2.5 md:grid-cols-[10rem_minmax(0,1fr)] md:items-baseline"
      >
        <span className="font-display text-[16px] leading-tight text-foreground decoration-1 underline-offset-[3px] group-hover:underline">
          {link.label}
        </span>
        {link.fact && (
          <span className="text-[12px] font-body leading-snug text-muted-foreground">
            {link.fact}
          </span>
        )}
      </Link>
    </li>
  );
}

function Row({ row, onRemove }: { row: HubRow; onRemove?: (row: HubRow) => void }) {
  return (
    <li className="group relative">
      <Link
        href={row.href}
        className="flex items-baseline justify-between gap-6 py-2.5 text-[13px] font-body transition-colors"
      >
        <span className="min-w-0 truncate">
          <span className="font-display text-[18px] text-foreground group-hover:text-primary">
            {row.title}
          </span>
          {row.detail && <span className="ml-3 text-muted-foreground">{row.detail}</span>}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{row.when}</span>
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(row)}
          aria-label={`Remove ${row.title}`}
          title="Remove"
          className="absolute -right-8 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

export function HubFrame({ hub, rows, onRemoved, links = [] }: HubFrameProps) {
  const confirm = useConfirm();
  const [removing, setRemoving] = useState('');

  const remove = hub.remove
    ? async (row: HubRow) => {
        const ok = await confirm({
          title: `Remove ${row.title}?`,
          message: 'It leaves this list and its history goes with it.',
          confirmLabel: 'Remove',
          variant: 'warning',
        });
        if (!ok) return;
        setRemoving(row.id);
        try {
          await hub.remove!(row.id);
          onRemoved?.();
        } finally {
          setRemoving('');
        }
      }
    : undefined;

  return (
    <>
      <header className="animate-slide-up stagger-1">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <PersonaMascot size={40} />
            <h1 className="font-display italic text-[40px] leading-none text-foreground">
              {hub.title}
            </h1>
          </div>
          <Link
            href={hub.newRoute}
            className="mt-2 shrink-0 font-display text-[18px] text-foreground decoration-1 underline-offset-[3px] hover:underline"
          >
            {hub.newLabel}
          </Link>
        </div>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          {hub.subtitle}
        </p>
      </header>

      <section aria-label={hub.title} className="mt-10 animate-slide-up stagger-2">
        <div className="h-px" style={{ background: 'var(--audience-accent)' }} />
        {rows === 'loading' ? (
          <GhostSkeleton caption="Reading your plans" />
        ) : rows === 'error' ? (
          <p className="pt-4 text-[13px] leading-relaxed text-muted-foreground">
            The list could not be read.
          </p>
        ) : rows.length === 0 ? (
          <p className="pt-4 text-[13px] leading-relaxed text-muted-foreground">
            {hub.emptyLine}{' '}
            <Link href={hub.newRoute} className="text-primary hover:underline">
              {hub.newLabel}
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                onRemove={remove && removing !== row.id ? remove : undefined}
              />
            ))}
          </ul>
        )}
      </section>

      {links.length > 0 && (
        <section aria-label="Other ways in" className="mt-14 animate-slide-up stagger-3">
          <p className="font-display italic text-[18px] leading-none text-muted-foreground">
            Other ways in
          </p>
          <ul className="mt-2 divide-y divide-border/50">
            {links.map((link) => (
              <WayInRow key={link.href} link={link} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
