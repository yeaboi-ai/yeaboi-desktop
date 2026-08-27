'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-base';
import { RefreshCw, ChevronRight } from 'lucide-react';

interface AiCallRow {
  id: string;
  occurred_at: string;
  provider: string;
  operation: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
  is_estimated: boolean;
  units: Record<string, unknown>;
}

interface AiCallBucket {
  key: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
}

interface InspectorResponse {
  session_id: string;
  calls: AiCallRow[];
  aggregations: {
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_read: number;
    total_cache_write: number;
    total_cost_usd: number;
    is_partially_estimated: boolean;
    by_model: AiCallBucket[];
    by_provider: AiCallBucket[];
    by_operation: AiCallBucket[];
  };
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const fmtCost = (n: number) => `$${n.toFixed(4)}`;

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AiInspectorSection({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<InspectorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showCalls, setShowCalls] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/session-ai-calls-proxy?sessionId=${encodeURIComponent(sessionId)}&limit=2000`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: InspectorResponse) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshTick]);

  const refresh = () => {
    setLoading(true);
    setRefreshTick((t) => t + 1);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground/80">
          AI Inspector
          {data?.aggregations.is_partially_estimated && (
            <span className="ml-1.5 normal-case tracking-normal text-warning/85">
              (partial estimate)
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded p-1 text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/85 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="text-[11px] text-destructive/85">{error}</div>}

      {!error && !data && loading && (
        <div className="text-[11px] italic text-muted-foreground/60">Loading…</div>
      )}

      {data && data.aggregations.total_calls === 0 && (
        <div className="text-[11px] italic text-muted-foreground/60">
          No AI calls recorded for this session yet.
        </div>
      )}

      {data && data.aggregations.total_calls > 0 && (
        <div className="space-y-2">
          {/* Aggregations */}
          <div>
            <KV label="Calls" value={String(data.aggregations.total_calls)} />
            <KV
              label="Input"
              value={`${fmtTokens(data.aggregations.total_input_tokens)} (${data.aggregations.total_input_tokens.toLocaleString()})`}
            />
            <KV
              label="Output"
              value={`${fmtTokens(data.aggregations.total_output_tokens)} (${data.aggregations.total_output_tokens.toLocaleString()})`}
            />
            <KV
              label="Cache R/W"
              value={`${fmtTokens(data.aggregations.total_cache_read)} / ${fmtTokens(data.aggregations.total_cache_write)}`}
            />
            <KV label="Cost" value={fmtCost(data.aggregations.total_cost_usd)} />
          </div>

          {/* Per-model */}
          <BreakdownGroup label="By model" rows={data.aggregations.by_model} />
          {/* Per-provider */}
          <BreakdownGroup label="By provider" rows={data.aggregations.by_provider} />
          {/* Per-operation */}
          <BreakdownGroup label="By operation" rows={data.aggregations.by_operation} />

          {/* Per-call expandable list */}
          <div>
            <button
              onClick={() => setShowCalls((v) => !v)}
              className="flex w-full items-center justify-between rounded px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-foreground/[0.04]"
            >
              <span>Calls ({data.calls.length})</span>
              <ChevronRight
                className={`size-3 transition-transform ${showCalls ? 'rotate-90' : ''}`}
              />
            </button>
            {showCalls && (
              <div className="mt-1 max-h-[320px] overflow-y-auto rounded border border-border/40">
                {data.calls.map((c) => (
                  <div
                    key={c.id}
                    className="cursor-pointer border-t border-border/40 px-2 py-1.5 first:border-t-0 hover:bg-foreground/[0.04]"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[10px]">
                      <span className="font-mono text-muted-foreground/80">
                        {fmtTime(c.occurred_at)}
                      </span>
                      <span className="font-mono">
                        {fmtCost(c.cost_usd)}
                        {c.is_estimated && <span className="text-warning">~</span>}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px]">
                      <span className="truncate font-mono text-foreground/75" title={c.model || ''}>
                        {c.operation} · {c.model || c.provider}
                      </span>
                      <span className="whitespace-nowrap font-mono text-muted-foreground/70">
                        {fmtTokens(c.input_tokens)}/{fmtTokens(c.output_tokens)}
                        {(c.cache_read > 0 || c.cache_write > 0) && (
                          <>
                            {' '}
                            · cache {fmtTokens(c.cache_read)}/{fmtTokens(c.cache_write)}
                          </>
                        )}
                      </span>
                    </div>
                    {expanded === c.id && (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-foreground/[0.04] p-1.5 font-mono text-[9px] text-muted-foreground">
                        {JSON.stringify(
                          { id: c.id, provider: c.provider, units: c.units },
                          null,
                          2,
                        )}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/95">{value}</span>
    </div>
  );
}

function BreakdownGroup({ label, rows }: { label: string; rows: AiCallBucket[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="truncate font-mono text-foreground/85" title={r.key}>
              {r.key}
            </span>
            <span className="whitespace-nowrap font-mono text-muted-foreground/85">
              {r.calls}× · {fmtTokens(r.input_tokens + r.output_tokens)} · {fmtCost(r.cost_usd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
