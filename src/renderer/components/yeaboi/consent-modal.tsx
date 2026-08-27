'use client';

// The filesystem-sandbox consent modal.
//
// yeaboi may only touch its own data directory unless a path is allowed. When
// something is refused, the backend queues the denial and announces it on the
// ambient feed; this is where the person answers. The three answers and what
// each one means are the sandbox's, not this modal's — the same three the
// terminal's popup offers.
//
// The access that triggered the request has already failed. Consent is for the
// retry, which is why the modal says what was refused rather than pretending to
// hold anything up.

import { useEffect, useState } from 'react';
import { type ConsentRequest, getConsentRequests, resolveConsent } from '@/lib/yeaboi/ambience';
import { Button } from '@/components/ui/button';

const CHOICES: ReadonlyArray<readonly [string, string, string]> = [
  ['allow_once', 'Allow once', 'For this run only — forgotten when yeaboi exits'],
  ['allow_always', 'Always allow', 'Added to the whitelist in ~/.yeaboi/.env'],
  ['deny', 'Deny', 'yeaboi will not touch this path'],
];

export interface ConsentModalProps {
  /** Bumped whenever a consent_request arrives on the ambient feed. */
  signal: number;
}

export function ConsentModal({ signal }: ConsentModalProps) {
  const [queue, setQueue] = useState<ConsentRequest[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Read the queue rather than trust the event: a window that reloaded
    // between the denial and the click would otherwise show nothing at all.
    getConsentRequests().then(
      (page) => setQueue(page.requests),
      () => setQueue([]),
    );
  }, [signal]);

  const request = queue[0];
  if (!request) return null;

  function answer(choice: string): void {
    if (!request) return;
    setBusy(true);
    resolveConsent(request.req_id, choice).finally(() => {
      setBusy(false);
      setQueue((rest) => rest.slice(1));
    });
  }

  const verb = request.mode === 'write' ? 'write to' : 'read from';
  const feature = request.context || 'A feature';

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Allow file access?"
        className="w-[440px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        <h2 className="text-sm font-medium text-foreground mb-3">Allow file access?</h2>
        <p className="text-[13px] text-muted-foreground leading-snug">
          <strong className="text-foreground">{feature}</strong> wants to {verb}:
        </p>
        <p className="my-2 rounded-lg bg-secondary/60 px-3 py-2 font-mono text-[12px] text-foreground break-all">
          {request.path}
        </p>
        <p className="text-[11px] text-muted-foreground/70 mb-4">
          yeaboi only accesses ~/.yeaboi unless you allow a path.
        </p>
        <div className="flex items-center justify-end gap-2">
          {CHOICES.map(([choice, label, hint]) => (
            <Button
              key={choice}
              variant={choice === 'allow_once' ? 'default' : 'outline'}
              size="sm"
              title={hint}
              disabled={busy}
              onClick={() => answer(choice)}
            >
              {label}
            </Button>
          ))}
        </div>
        {queue.length > 1 && (
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            {queue.length - 1} more waiting.
          </p>
        )}
      </div>
    </div>
  );
}
