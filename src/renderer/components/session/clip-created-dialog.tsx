'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Check, Copy, ExternalLink, Link2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface ClipPreviewLine {
  speaker: string | null;
  text: string;
}

interface ClipCreatedDialogProps {
  open: boolean;
  onClose: () => void;
  url: string;
  lineCount: number;
  /** Human-readable summary of which filters were applied when the clip was
   *  created — e.g. `This call`, `Full session · Omar`, `This call · "Postgres"`. */
  filterDescription: string;
  /** First 1–2 transcript lines for at-a-glance verification. */
  preview: ClipPreviewLine[];
}

/**
 * W6.6.2 — Clip-created dialog.
 *
 * Replaces the silent toast that ran after a successful POST /clips. Surfaces
 * the share URL with copy + open-in-new-tab affordances, plus a tiny preview
 * so the user can confirm the clip captures what they intended.
 *
 * Uses the Base UI Dialog primitive directly (instead of the shared
 * `DialogContent` wrapper) so we can stack the backdrop + popup above the
 * recap modal (`z-[300]`). The shared wrapper hardcodes `z-50`, which would
 * leave this dialog hidden behind the recap.
 */
export function ClipCreatedDialog({
  open,
  onClose,
  url,
  lineCount,
  filterDescription,
  preview,
}: ClipCreatedDialogProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Best-effort auto-copy on open so muscle-memory ("click → paste") still
  // works for users who recognise the previous toast flow. Failures are
  // silent — the explicit Copy button is the user-visible affordance.
  // The parent keys this component on `url` so `copied` resets naturally
  // when a new clip is created; no reset needed here.
  useEffect(() => {
    if (!open) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => setCopied(true),
        () => {
          /* clipboard blocked — user can still click Copy */
        },
      );
    }
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the input so the user can ⌘C manually.
      inputRef.current?.select();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[400] bg-black/40 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[401] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background ring-1 ring-foreground/10 shadow-2xl outline-none overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-info" />
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  Clip created
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {/* URL row */}
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 rounded-md bg-foreground/[0.04] ring-1 ring-border/60 px-3 py-2 text-[12px] font-mono text-foreground/90 truncate focus:outline-none focus:ring-foreground/30"
                aria-label="Shareable clip URL"
              />
              <Button
                type="button"
                variant={copied ? 'outline' : 'default'}
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {/* Open-in-new-tab + context */}
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-info hover:text-info/80 transition-colors font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
              <span className="text-muted-foreground/70 truncate">
                {lineCount} {lineCount === 1 ? 'message' : 'messages'} · {filterDescription}
              </span>
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div className="rounded-lg bg-foreground/[0.03] ring-1 ring-border/40 px-3.5 py-3 space-y-1.5">
                {preview.map((line, i) => (
                  <p
                    key={i}
                    className="text-[13px] leading-relaxed text-foreground/85 line-clamp-1"
                  >
                    {line.speaker && (
                      <span className="text-muted-foreground/70 mr-1.5 font-medium">
                        {line.speaker}:
                      </span>
                    )}
                    {line.text}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              Anyone with the link can view this clip. The transcript is captured as a snapshot —
              later edits or redactions don&apos;t affect what was clipped.
            </p>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
