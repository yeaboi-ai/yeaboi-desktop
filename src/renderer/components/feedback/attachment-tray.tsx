'use client';

// Attaching a screenshot or a log: drop it, paste it, or browse for it.
//
// The drag-counter idiom is the one chat-panel.tsx uses — a counter rather than
// a boolean, because dragenter/dragleave fire for every child element the
// pointer crosses. Each file goes to the backend as base64 and comes back as a
// path; the form only ever holds paths.

import * as React from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { attachFeedbackFile } from '@/lib/yeaboi/ambience';
import { toBase64 } from '@/lib/yeaboi/voice';
import {
  acceptAttribute,
  classifyFile,
  formatBytes,
  maxAttachments,
  type Attachment,
  type FeedbackOptions,
} from '@/lib/yeaboi/feedback';
import { cn } from '@/lib/utils';

export interface AttachmentTrayHandle {
  /** Take files from anywhere — a drop, a paste, or the file input. */
  accept: (files: File[]) => void;
}

export function useAttachments(options: FeedbackOptions, onRefuse: (why: string) => void) {
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(0);

  // Object URLs outlive the render that made them, so they are revoked on the
  // unmount. Through a ref rather than the state directly: an unmount-only
  // cleanup closes over the render that installed it, which is the empty first
  // one, and would revoke nothing.
  const live = React.useRef<Attachment[]>([]);
  React.useEffect(() => {
    live.current = attachments;
  }, [attachments]);
  React.useEffect(() => {
    return () => {
      for (const a of live.current) if (a.preview) URL.revokeObjectURL(a.preview);
    };
  }, []);

  const accept = React.useCallback(
    (files: File[]) => {
      let room = maxAttachments(options) - attachments.length - uploading;
      for (const file of files) {
        if (room <= 0) {
          onRefuse(`${maxAttachments(options)} attachments is the most this form takes.`);
          return;
        }
        const verdict = classifyFile(file, options);
        if ('refusal' in verdict) {
          onRefuse(verdict.refusal);
          continue;
        }
        room -= 1;
        setUploading((n) => n + 1);
        toBase64(file)
          .then((data) => attachFeedbackFile({ name: file.name, mime: verdict.mime, data }))
          .then(
            (stored) => {
              setAttachments((current) => [
                ...current,
                {
                  ...stored,
                  preview: verdict.kind === 'image' ? URL.createObjectURL(file) : undefined,
                },
              ]);
            },
            (e: Error) => onRefuse(`${file.name} — ${e.message}`),
          )
          .finally(() => setUploading((n) => n - 1));
      }
    },
    [attachments.length, uploading, options, onRefuse],
  );

  const remove = React.useCallback((path: string) => {
    setAttachments((current) => {
      const going = current.find((a) => a.path === path);
      if (going?.preview) URL.revokeObjectURL(going.preview);
      return current.filter((a) => a.path !== path);
    });
  }, []);

  return { attachments, uploading, accept, remove };
}

export function AttachmentTray({
  options,
  attachments,
  uploading,
  onAccept,
  onRemove,
  disabled,
}: {
  options: FeedbackOptions;
  attachments: Attachment[];
  uploading: number;
  onAccept: (files: File[]) => void;
  onRemove: (path: string) => void;
  disabled?: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const full = attachments.length + uploading >= maxAttachments(options);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => input.current?.click()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg bg-secondary/70 px-2.5 py-1.5',
            'font-body text-[12px] text-foreground transition-colors hover:bg-secondary',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
          )}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach a file
        </button>
        <p className="font-body text-[11.5px] text-muted-foreground">
          {full
            ? 'That is as many as the form takes.'
            : 'Or drop one anywhere here — ⌘V pastes a screenshot.'}
        </p>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          accept={acceptAttribute(options)}
          onChange={(event) => {
            onAccept(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {(attachments.length > 0 || uploading > 0) && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li
              key={a.path}
              className="group animate-scale-in relative w-[124px] overflow-hidden rounded-xl bg-secondary/50 ring-1 ring-border/50 motion-reduce:animate-none"
            >
              {/* The mark sits underneath, so a preview the browser cannot
                  decode falls back to it rather than to a broken image. */}
              <div className="relative flex h-16 items-center justify-center bg-background/40">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                {a.preview && (
                  <img
                    src={a.preview}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                    className="absolute inset-0 h-16 w-full object-cover"
                  />
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate font-mono text-[10.5px] text-foreground" title={a.name}>
                  {a.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {formatBytes(a.bytes)}
                  {a.lines !== undefined && ` · ${a.lines} lines`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.path)}
                aria-label={`Remove ${a.name}`}
                className={cn(
                  'absolute top-1 right-1 rounded-full bg-background/90 p-1 text-muted-foreground',
                  'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  'outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <li
              key={`pending-${i}`}
              className="h-[92px] w-[124px] animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The dashed overlay a drag puts over the composer. */
export function DropVeil({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5">
      <div className="text-center">
        <Paperclip className="mx-auto mb-2 h-6 w-6 text-primary/60" aria-hidden />
        <p className="font-body text-[12px] font-medium text-primary/80">{label}</p>
      </div>
    </div>
  );
}

/** Files carried by a drag or a paste, in the order the OS gave them. */
export function filesFrom(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []);
}
