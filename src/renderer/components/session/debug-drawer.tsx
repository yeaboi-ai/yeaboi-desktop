"use client";

import { useMemo } from "react";
import { AiInspectorSection } from "./ai-inspector-section";
import { DrawerShell } from "./drawer-shell";

export interface DebugIntent {
  ts: number;
  user_message: string;
  route: string;
  reason: string;
  tokens_patch?: Record<string, unknown> | null;
  target_screen_id?: string | null;
  target_screen_name?: string | null;
  instruction?: string | null;
  new_screens?: unknown[];
  had_active_pipeline?: boolean;
}

export interface DebugPipelineStart {
  ts: number;
  run_id: string;
  kind: string;
  target_device: string;
  recipe_files?: string[] | null;
  existing_screens_count: number;
  screen_plan: unknown[];
  ai_response_preview?: string;
}

export type DebugRenderStatus =
  | "planned"
  | "skeleton_visible"
  | "thinking"
  | "completed"
  | "cancelled"
  | "removed";

export interface DebugRenderItem {
  run_id: string;
  screen_id: string;
  name: string;
  kind: "screen" | "modal" | "drawer" | "popover";
  status: DebugRenderStatus;
  first_seen_ts: number;
  last_activity_ts: number;
  completed_ts?: number;
  source: "plan" | "pipeline" | "additive";
}

export interface DebugPipelineMetrics {
  ts: number;
  run_id: string;
  pipeline_kind: string;
  total_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  ai_call_count: number;
  phases: Array<{ name: string; duration_ms: number }>;
  per_model: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number; duration_ms: number }>;
  [k: string]: unknown;
}

interface DebugDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  sessionId?: string;
  intents: DebugIntent[];
  pipelineStarts: DebugPipelineStart[];
  pipelineMetrics: DebugPipelineMetrics[];
  designTokens: Record<string, unknown> | null;
  renderItems: DebugRenderItem[];
  pendingMessages: string[];
}

interface DebugPanelProps {
  sessionId?: string;
  intents: DebugIntent[];
  pipelineStarts: DebugPipelineStart[];
  pipelineMetrics: DebugPipelineMetrics[];
  designTokens: Record<string, unknown> | null;
  renderItems: DebugRenderItem[];
  pendingMessages: string[];
}

const STATUS_STYLE: Record<DebugRenderStatus, { bg: string; fg: string; label: string }> = {
  planned:          { bg: "color-mix(in srgb, var(--foreground) 6%, transparent)",  fg: "rgba(255,255,255,0.55)", label: "Planned" },
  skeleton_visible: { bg: "rgba(160,170,250,0.10)",  fg: "rgba(160,170,250,0.85)", label: "Skeleton" },
  thinking:         { bg: "rgba(229,166,48,0.12)",   fg: "rgba(229,166,48,0.95)",  label: "Thinking" },
  completed:        { bg: "rgba(34,197,94,0.12)",    fg: "rgba(74,222,128,0.95)",  label: "Completed" },
  cancelled:        { bg: "rgba(239,68,68,0.10)",    fg: "rgba(248,113,113,0.85)", label: "Cancelled" },
  removed:          { bg: "rgba(255,255,255,0.04)",  fg: "rgba(255,255,255,0.35)", label: "Removed" },
};

function fmtAge(ts: number, now: number) {
  const ms = now - ts;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

const fmtMs = (ms: number) => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtCost = (n: number) => `$${n.toFixed(4)}`;

export function DebugPanel({
  sessionId,
  intents,
  pipelineStarts,
  pipelineMetrics,
  designTokens,
  renderItems,
  pendingMessages,
}: DebugPanelProps) {
  // Sample "now" once per render-items mutation. Slightly-stale ages are
  // fine for a debug drawer; the value refreshes whenever new items
  // arrive (which is when ages would actually need updating).
  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [renderItems]);
  const orderedRenderItems = useMemo(
    () => {
      // Plan-mirror entries (run_id="plan", source="plan") are useful for
      // tracking which screens the plan card knows about, but when an
      // actual pipeline run picks up the same screen_id, the pipeline
      // entry is more specific (real run_id, real status). Hide the
      // plan-mirror in that case so the queue shows: in-progress
      // screens (pipeline source) + remaining-to-do (plan source for
      // screens not yet running).
      const pipelineScreenIds = new Set(
        renderItems
          .filter((r) => r.source !== "plan")
          .map((r) => r.screen_id),
      );
      const visible = renderItems.filter(
        (r) => !(r.source === "plan" && pipelineScreenIds.has(r.screen_id)),
      );
      return visible.sort((a, b) => b.last_activity_ts - a.last_activity_ts);
    },
    [renderItems],
  );
  const totals = useMemo(() => {
    let cost = 0;
    let inTok = 0;
    let outTok = 0;
    let calls = 0;
    let ms = 0;
    for (const m of pipelineMetrics) {
      cost += m.total_cost_usd || 0;
      inTok += m.total_input_tokens || 0;
      outTok += m.total_output_tokens || 0;
      calls += m.ai_call_count || 0;
      ms += m.total_ms || 0;
    }
    return { cost, inTok, outTok, calls, ms, runs: pipelineMetrics.length };
  }, [pipelineMetrics]);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-[12px] text-foreground/85">
        {/* ── Session totals ── */}
        <Section label="Session totals">
          <KV label="Pipeline runs" value={String(totals.runs)} />
          <KV label="Total time"     value={fmtMs(totals.ms)} />
          <KV label="AI calls"       value={String(totals.calls)} />
          <KV label="Tokens (in/out)" value={`${totals.inTok.toLocaleString()} / ${totals.outTok.toLocaleString()}`} />
          <KV label="Total cost"     value={fmtCost(totals.cost)} />
          <KV label="Pending msgs"   value={String(pendingMessages.length)} />
        </Section>

        {/* ── AI Inspector (all usage_events for this session) ── */}
        {sessionId && <AiInspectorSection sessionId={sessionId} />}

        {/* ── Render queue (per-screen state) ── */}
        <Section
          label={`Render queue (${orderedRenderItems.length}) — ${
            orderedRenderItems.filter((r) => r.status === "completed").length
          } completed · ${
            orderedRenderItems.filter((r) => r.status === "skeleton_visible" || r.status === "thinking").length
          } in progress`}
        >
          {renderItems.length === 0 && <Empty>No screens tracked yet</Empty>}
          {renderItems.length > 0 && (
            <div>
              {orderedRenderItems.slice(0, 30).map((r) => {
                const s = STATUS_STYLE[r.status];
                const age = fmtAge(r.last_activity_ts, now);
                return (
                    <div key={`${r.run_id}|${r.screen_id}`} className="border-t border-border/60 py-2 first:border-t-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[9px] uppercase tracking-wider font-semibold whitespace-nowrap rounded-full px-1.5 py-[2px]"
                            style={{ background: s.bg, color: s.fg }}
                          >
                            {s.label}
                          </span>
                          <span className="text-[11px] text-foreground/95 truncate" title={r.name}>{r.name}</span>
                          {r.kind !== "screen" && (
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 whitespace-nowrap">{r.kind}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{age} ago</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono flex items-center gap-2">
                        <span title="Screen id">{r.screen_id}</span>
                        <span>·</span>
                        <span title="Run id">{r.run_id === "plan" ? "plan" : r.run_id.slice(0, 8)}</span>
                        <span>·</span>
                        <span className="text-muted-foreground/50">{r.source}</span>
                      </div>
                    </div>
                  );
                })}
              {orderedRenderItems.length > 30 && (
                <div className="text-[10px] text-muted-foreground/50 italic pt-2">+{orderedRenderItems.length - 30} older</div>
              )}
            </div>
          )}
        </Section>

        {/* ── Active design tokens ── */}
        {designTokens && (
          <Section label="Design tokens">
            <pre className="text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap break-words bg-foreground/[0.04] rounded p-2">
              {JSON.stringify(designTokens, null, 2)}
            </pre>
          </Section>
        )}

        {/* ── Latest intent classifications ── */}
        <Section label={`Intents (${intents.length})`}>
          {intents.length === 0 && <Empty>No intents yet</Empty>}
          {intents.slice().reverse().slice(0, 12).map((i, idx) => (
            <div key={idx} className="border-t border-border/60 py-2 first:border-t-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${routeColor(i.route)}`}>
                  {i.route}
                </span>
                {i.had_active_pipeline ? <span className="text-[9px] text-success/70">in-flight</span> : null}
              </div>
              <div className="text-foreground/95 mb-1 italic truncate" title={i.user_message}>“{i.user_message}”</div>
              <div className="text-[10px] text-muted-foreground/80">{i.reason}</div>
              {i.target_screen_name && (
                <div className="text-[10px] text-muted-foreground mt-1">→ target: <span className="text-warning/80">{i.target_screen_name}</span></div>
              )}
              {i.tokens_patch && Object.keys(i.tokens_patch).length > 0 && (
                <pre className="text-[10px] text-muted-foreground font-mono mt-1 bg-foreground/[0.04] rounded p-1.5">
                  {JSON.stringify(i.tokens_patch, null, 2)}
                </pre>
              )}
              {i.new_screens && i.new_screens.length > 0 && (
                <pre className="text-[10px] text-muted-foreground font-mono mt-1 bg-foreground/[0.04] rounded p-1.5">
                  {JSON.stringify(i.new_screens, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </Section>

        {/* ── Pipeline runs ── */}
        <Section label={`Pipeline runs (${pipelineStarts.length})`}>
          {pipelineStarts.length === 0 && <Empty>No pipelines yet</Empty>}
          {pipelineStarts.slice().reverse().slice(0, 12).map((p) => {
            const metrics = pipelineMetrics.find((m) => m.run_id === p.run_id);
            return (
              <div key={p.run_id} className="border-t border-border/60 py-2 first:border-t-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-warning/85">{p.kind}</span>
                    <span className="text-[10px] text-muted-foreground/70">·</span>
                    <span className="text-[10px] text-muted-foreground">{p.target_device}</span>
                    <span className="text-[10px] text-muted-foreground/70">·</span>
                    <span className="text-[10px] font-mono text-muted-foreground/80">{p.run_id.slice(0, 8)}</span>
                  </div>
                  {metrics ? (
                    <span className="text-[10px] text-success/70">{fmtMs(metrics.total_ms)} · {fmtCost(metrics.total_cost_usd)}</span>
                  ) : (
                    <span className="text-[10px] text-warning/70 animate-pulse">running…</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mb-1">
                  Existing on canvas: {p.existing_screens_count} · plan: {Array.isArray(p.screen_plan) ? p.screen_plan.length : 0} screens
                </div>
                {Array.isArray(p.screen_plan) && p.screen_plan.length > 0 && (
                  <pre className="text-[10px] text-muted-foreground font-mono bg-foreground/[0.04] rounded p-1.5">
                    {JSON.stringify(p.screen_plan, null, 2)}
                  </pre>
                )}
                {metrics && (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[10px] text-muted-foreground">
                      {metrics.ai_call_count} calls · {metrics.total_input_tokens.toLocaleString()} in / {metrics.total_output_tokens.toLocaleString()} out
                    </div>
                    {metrics.phases.length > 0 && (
                      <div className="text-[10px] text-muted-foreground/80">
                        {metrics.phases.map((ph) => `${ph.name} ${fmtMs(ph.duration_ms)}`).join(" · ")}
                      </div>
                    )}
                    {Object.keys(metrics.per_model).length > 0 && (
                      <div className="text-[10px] text-muted-foreground/80">
                        Models: {Object.entries(metrics.per_model).map(([m, v]) => `${m} (${v.calls} · ${fmtCost(v.cost_usd)})`).join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        {/* ── Queued messages ── */}
        {pendingMessages.length > 0 && (
          <Section label={`Queue (${pendingMessages.length})`}>
            {pendingMessages.map((m, i) => (
              <div key={i} className="text-[11px] text-muted-foreground italic border-t border-border/60 py-1.5 first:border-t-0 truncate">{m}</div>
            ))}
          </Section>
        )}
      </div>
  );
}

export function DebugDrawer({
  open,
  onClose,
  onOpen,
  ...panelProps
}: DebugDrawerProps) {
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      onOpen={onOpen}
      side="right"
      title="Debug"
      widthPx={460}
    >
      <DebugPanel {...panelProps} />
    </DrawerShell>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground/80 mb-1.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[11px] py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/95">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted-foreground/60 italic py-1">{children}</div>;
}

function routeColor(r: string): string {
  if (r === "tokens") return "text-success/85";
  if (r === "edit")   return "text-info/85";
  if (r === "add")    return "text-warning/85";
  if (r === "cancel") return "text-destructive/85";
  return "text-muted-foreground";
}
