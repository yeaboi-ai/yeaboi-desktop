'use client';

// The screenshare source picker. Electron resolves getDisplayMedia through
// main's display-media handler (src/main/capture.ts); when a request lands,
// main pings capture:request and this component draws the choice — screens
// and windows with live thumbnails. Picking answers the pending request;
// dismissing denies it, which is what a cancelled share should be.

import { useEffect, useState } from 'react';
import { AppWindow, Monitor, X } from 'lucide-react';

interface Source {
  id: string;
  name: string;
  thumbnail: string;
  kind: 'screen' | 'window';
}

export function CapturePicker() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      window.yeaboi.onCaptureRequest(() => {
        setOpen(true);
        setSources(null);
        void window.yeaboi.listCaptureSources().then(setSources, () => setSources([]));
      });
    } catch {
      /* bridge unavailable (plain browser) */
    }
  }, []);

  if (!open) return null;

  const answer = (sourceId: string) => {
    setOpen(false);
    void window.yeaboi.pickCaptureSource(sourceId).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your screen"
        className="w-[640px] max-w-[calc(100vw-3rem)] max-h-[80vh] overflow-y-auto rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Share your screen</h2>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => answer('')}
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {!sources && <p className="text-[12px] text-muted-foreground">Looking at your screens…</p>}
        {sources && sources.length === 0 && (
          <p className="text-[12px] text-muted-foreground">Nothing shareable was found.</p>
        )}
        {sources && sources.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => answer(source.id)}
                className="rounded-xl overflow-hidden ring-1 ring-border/60 hover:ring-primary/50 transition-all text-left bg-secondary/40"
              >
                <img src={source.thumbnail} alt="" className="w-full aspect-video object-cover" />
                <span className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-foreground truncate">
                  {source.kind === 'screen' ? (
                    <Monitor className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <AppWindow className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{source.name}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
