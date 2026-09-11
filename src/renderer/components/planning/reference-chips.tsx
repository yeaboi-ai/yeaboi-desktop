'use client';

// The row under a description: one pill per reference (its source's mark and
// its label) and one thumbnail per screenshot. The composer shows it while the
// project is being described, with × on each; the project page shows it again,
// read-only unless the reader may edit, with a pill opening its link in the
// browser and a thumbnail opening the image.

import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ProviderMark } from '@/components/planning/provider-mark';
import {
  REFERENCE_COPY,
  attachmentSrc,
  chipLabel,
  iconFor,
  type ProjectAttachment,
  type ProjectReference,
} from '@/lib/yeaboi/references';
import { cn } from '@/lib/utils';

/** A screenshot chosen before the project exists: the file and its preview. */
export interface PendingShot {
  key: string;
  file: File;
  preview: string;
}

const PILL =
  'group/chip inline-flex h-6 max-w-[16rem] items-center gap-1.5 rounded-full bg-secondary/60 pl-1.5 pr-2 text-[12px] font-body text-foreground animate-scale-in motion-reduce:animate-none';

const REMOVE =
  'rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50';

function Chip({
  reference,
  readOnly,
  onRemove,
}: {
  reference: ProjectReference;
  readOnly: boolean;
  onRemove?: () => void;
}) {
  const label = chipLabel(reference);
  const body = (
    <>
      <ProviderMark icon={iconFor(reference.source)} size={12} className="text-foreground/70" />
      <span className="truncate">{label}</span>
    </>
  );
  if (readOnly) {
    return reference.url ? (
      <a
        href={reference.url}
        target="_blank"
        rel="noreferrer"
        title={reference.subject}
        className={cn(PILL, 'transition-colors hover:bg-secondary')}
      >
        {body}
      </a>
    ) : (
      <span className={PILL} title={reference.subject}>
        {body}
      </span>
    );
  }
  return (
    <span className={cn(PILL, 'pr-1')} title={reference.subject}>
      {body}
      <button
        type="button"
        onClick={onRemove}
        aria-label={REFERENCE_COPY.removeLabel(label)}
        className={cn(REMOVE, 'ml-0.5 group-hover/chip:opacity-100')}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Thumb({
  src,
  name,
  onOpen,
  onRemove,
}: {
  src: string;
  name: string;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  // Keyed on src so a corrected URL (the API base resolves a tick late) gets a
  // fresh element rather than the one a failed load already hid.
  const image = (
    <img
      key={src}
      src={src}
      alt=""
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
      className="h-full w-full object-cover"
    />
  );
  return (
    <span className="group/shot relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary/40 ring-1 ring-border/50 animate-scale-in motion-reduce:animate-none">
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={name} className="block h-full w-full">
          {image}
        </button>
      ) : (
        image
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={REFERENCE_COPY.removeLabel(name)}
          className={cn(
            REMOVE,
            'absolute top-0.5 right-0.5 bg-background/90 group-hover/shot:opacity-100',
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function ReferenceChips({
  references,
  attachments = [],
  pending = [],
  uploading = 0,
  apiUrl = '',
  readOnly = false,
  onRemoveReference,
  onRemoveAttachment,
  onRemovePending,
  className,
}: {
  references: readonly ProjectReference[];
  attachments?: readonly ProjectAttachment[];
  pending?: readonly PendingShot[];
  uploading?: number;
  /** The planning backend's origin; a stored attachment's url is relative to it. */
  apiUrl?: string;
  readOnly?: boolean;
  onRemoveReference?: (index: number) => void;
  onRemoveAttachment?: (id: string) => void;
  onRemovePending?: (key: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<{ src: string; name: string } | null>(null);
  if (!references.length && !attachments.length && !pending.length && uploading <= 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {references.map((reference, index) => (
        <Chip
          key={`${reference.source}:${reference.subject}`}
          reference={reference}
          readOnly={readOnly}
          onRemove={() => onRemoveReference?.(index)}
        />
      ))}
      {attachments.map((attachment) => {
        const src = attachmentSrc(apiUrl, attachment.url);
        return (
          <Thumb
            key={attachment.id}
            src={src}
            name={attachment.filename}
            onOpen={() => setOpen({ src, name: attachment.filename })}
            onRemove={readOnly ? undefined : () => onRemoveAttachment?.(attachment.id)}
          />
        );
      })}
      {pending.map((shot) => (
        <Thumb
          key={shot.key}
          src={shot.preview}
          name={shot.file.name}
          onRemove={() => onRemovePending?.(shot.key)}
        />
      ))}
      {Array.from({ length: Math.max(0, uploading) }, (_, i) => (
        <span
          key={`pending-${i}`}
          className="h-14 w-14 animate-pulse rounded-lg bg-secondary/50 motion-reduce:animate-none"
        />
      ))}
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <DialogContent className="w-auto max-w-[min(92vw,1100px)] p-2 sm:max-w-[min(92vw,1100px)]">
          <DialogTitle className="sr-only">{open?.name ?? ''}</DialogTitle>
          {open && (
            <img src={open.src} alt={open.name} className="max-h-[80vh] w-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
