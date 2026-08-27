'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AIMeta {
  model?: string | null;
  latency_ms?: number | null;
  reason?: string | null;
}

/**
 * Extracts the AI metadata stashed in `attachments[?]._ai_meta` by the
 * /api/internal/messages endpoint. Returns null if not present.
 */
export function extractAIMeta(attachments?: Array<Record<string, unknown>> | null): AIMeta | null {
  if (!attachments) return null;
  for (const a of attachments) {
    const m = a?.['_ai_meta'];
    if (m && typeof m === 'object') {
      const meta = m as AIMeta;
      // Treat all-empty as absent
      if (meta.model || meta.latency_ms !== undefined || meta.reason) return meta;
    }
  }
  return null;
}

interface AIReasoningPeekProps {
  meta: AIMeta;
}

/** Hoverable info icon → popover with model / latency / reason. */
export function AIReasoningPeek({ meta }: AIReasoningPeekProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Why the agent said this"
            className="inline-flex items-center justify-center p-0.5 rounded text-muted-foreground/50 hover:text-info hover:bg-info/10 transition-colors"
          >
            <Info className="h-3 w-3" />
          </button>
        }
      />
      <PopoverContent className="w-72" align="start">
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-2">
          Why the agent said this
        </p>
        {meta.reason && (
          <p className="text-[12px] text-foreground/95 leading-relaxed mb-3">{meta.reason}</p>
        )}
        <dl className="space-y-1 text-[11px]">
          {meta.model && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground/70">Model</dt>
              <dd className="text-foreground/90 font-mono truncate">{meta.model}</dd>
            </div>
          )}
          {typeof meta.latency_ms === 'number' && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground/70">Latency</dt>
              <dd className="text-foreground/90 font-mono">{meta.latency_ms}ms</dd>
            </div>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
