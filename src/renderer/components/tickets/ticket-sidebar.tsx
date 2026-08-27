"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import type { Card, CardSyncStatus, CardUpdate } from "@/hooks/use-board";
import type { TicketBoardColumn } from "@/hooks/use-ticket";
import { useTicketTemplates } from "@/hooks/use-ticket-templates";
import { TemplateBadge } from "./template-badge";

const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21] as const;

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  card: Card;
  teamMembers: TeamMember[];
  onPatch: (patch: CardUpdate) => void;
  /** Columns of the board this card lives on — drives the Status select. */
  boardColumns?: TicketBoardColumn[];
  /** Labels pulled from the rest of the project — feeds the Add-label autocomplete. */
  availableLabels?: string[];
  /** Optional pre-rendered slot. When provided, replaces the default sidebar
   *  composition (the workspace passes the layout-driven children here). */
  children?: React.ReactNode;
}

export function TicketSidebar({
  card,
  teamMembers,
  onPatch,
  boardColumns = [],
  availableLabels = [],
  children,
}: Props) {
  if (children) {
    return <aside className="space-y-7 text-sm">{children}</aside>;
  }
  return (
    <aside className="space-y-7 text-sm">
      <SidebarSection label="Status">
        <StatusSelect card={card} columns={boardColumns} onPatch={onPatch} />
      </SidebarSection>

      <SidebarSection label="Type">
        <TypeSelect card={card} onPatch={onPatch} />
      </SidebarSection>

      <SidebarSection label="Priority">
        <PriorityChips priority={card.priority ?? null} onPatch={onPatch} />
      </SidebarSection>

      <SidebarSection label="Assignee">
        <AssigneeSelect card={card} teamMembers={teamMembers} onPatch={onPatch} />
      </SidebarSection>

      <SidebarSection label="Story points">
        <FibonacciPoints
          value={card.story_points}
          onChange={(v) => onPatch({ story_points: v })}
        />
      </SidebarSection>

      <SidebarSection label="Labels">
        <LabelsEditor
          labels={card.labels}
          available={availableLabels}
          onChange={(next) => onPatch({ labels: next })}
        />
      </SidebarSection>

      <SidebarSection label="Sync">
        <SyncControls card={card} />
      </SidebarSection>
    </aside>
  );
}

// ─── Exported sub-renderers (consumed by ticket-field-renderer.tsx) ────────

export function PriorityChips({
  priority,
  onPatch,
}: {
  priority: string | null;
  onPatch: (patch: CardUpdate) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRIORITIES.map((p) => {
        const active = priority === p;
        return (
          <button
            key={p}
            onClick={() => onPatch({ priority: active ? null : p })}
            className={`px-2 py-1 rounded-md text-xs capitalize border transition-colors ${
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${PRIORITY_DOT[p]}`} />
            {p}
          </button>
        );
      })}
    </div>
  );
}

export function AssigneeSelect({
  card,
  teamMembers,
  onPatch,
}: {
  card: Card;
  teamMembers: TeamMember[];
  onPatch: (patch: CardUpdate) => void;
}) {
  return (
    <select
      value={card.assignee_id ?? ""}
      onChange={(e) => onPatch({ assignee_id: e.target.value || null })}
      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
    >
      <option value="">Unassigned</option>
      {teamMembers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name ?? m.email}
        </option>
      ))}
    </select>
  );
}


// ─── Status: column dropdown ────────────────────────────────────────────────

export function StatusSelect({
  card,
  columns,
  onPatch,
}: {
  card: Card;
  columns: TicketBoardColumn[];
  onPatch: (patch: CardUpdate) => void;
}) {
  if (columns.length === 0) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  return (
    <select
      value={card.column_id}
      onChange={(e) => {
        if (e.target.value !== card.column_id) onPatch({ column_id: e.target.value });
      }}
      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
    >
      {sorted.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

// ─── Type: template dropdown ────────────────────────────────────────────────

export function TypeSelect({ card, onPatch }: { card: Card; onPatch: (patch: CardUpdate) => void }) {
  const templates = useTicketTemplates();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = useMemo(
    () => (card.template_id ? templates.find((t) => t.id === card.template_id) : null),
    [card.template_id, templates],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm hover:border-ring"
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {current ? (
            <>
              <TemplateBadge slug={current.slug} name={current.name} />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground italic">No type</span>
            </>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1">
          <button
            type="button"
            onClick={() => {
              if (card.template_id != null) onPatch({ template_id: null });
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/40"
          >
            <Check className={`h-3.5 w-3.5 ${card.template_id == null ? "opacity-100" : "opacity-0"}`} />
            <span className="italic">No type</span>
          </button>
          {templates.map((t) => {
            const selected = t.id === card.template_id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id !== card.template_id) onPatch({ template_id: t.id });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent/40"
              >
                <Check className={`h-3.5 w-3.5 ${selected ? "opacity-100" : "opacity-0"}`} />
                <TemplateBadge slug={t.slug} name={t.name} />
                <span className="truncate flex-1 text-left">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Story points: fibonacci row ────────────────────────────────────────────

export function FibonacciPoints({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FIBONACCI_POINTS.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-mono font-semibold tabular-nums border transition-colors ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title={active ? "Click to clear" : `${n} points`}
          >
            {n}
          </button>
        );
      })}
      {value != null && !FIBONACCI_POINTS.includes(value as (typeof FIBONACCI_POINTS)[number]) && (
        <span className="inline-flex h-7 items-center px-2 rounded-md bg-muted text-xs font-mono text-muted-foreground" title="Non-fibonacci value (legacy)">
          {value}
        </span>
      )}
    </div>
  );
}

// ─── Labels: chips + add ────────────────────────────────────────────────────

export function LabelsEditor({
  labels,
  available,
  onChange,
}: {
  labels: string[];
  available: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const remove = (label: string) => onChange(labels.filter((l) => l !== label));

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (labels.includes(trimmed)) {
      setInput("");
      return;
    }
    onChange([...labels, trimmed]);
    setInput("");
  };

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const lower = input.trim().toLowerCase();
    return available
      .filter((l) => !labels.includes(l) && l.toLowerCase().includes(lower))
      .slice(0, 6);
  }, [input, available, labels]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {labels.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No labels yet.</span>
        )}
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
          >
            {label}
            <button
              type="button"
              onClick={() => remove(label)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove label ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <div className="flex gap-1">
          <Input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Add label…"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(input);
              }
              if (e.key === "Backspace" && !input && labels.length > 0) {
                remove(labels[labels.length - 1]);
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => add(input)}
            disabled={!input.trim()}
            aria-label="Add label"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-40 mt-1 w-full rounded-md border border-border bg-popover shadow-lg py-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-accent/40"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sync: combined Jira + ADO menu ─────────────────────────────────────────

interface IntegrationListItem {
  id: string;
  provider: string;
  status: string;
}

interface SyncProvider {
  id: "jira" | "azure_devops";
  label: string;
  /** Single-letter mark used inside the brand square. */
  letter: string;
  /** Brand-ish background colour for the mark. Atlassian blue / Azure blue. */
  bg: string;
}

const SYNC_PROVIDERS: SyncProvider[] = [
  { id: "jira", label: "Jira", letter: "J", bg: "bg-[#2684FF]" },
  { id: "azure_devops", label: "Azure DevOps", letter: "A", bg: "bg-[#0078D4]" },
];

function ProviderMark({ provider, className = "" }: { provider: SyncProvider; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[11px] font-bold text-white ${provider.bg} ${className}`}
    >
      {provider.letter}
    </span>
  );
}

export function SyncControls({ card }: { card: Card }) {
  const { authFetch } = useAuthFetch();
  const [busy, setBusy] = useState<"jira" | "azure_devops" | null>(null);
  const [status, setStatus] = useState<CardSyncStatus | null | undefined>(card.sync_status);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationListItem[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  // Sync the local view of sync_status when the card prop changes.
  const [snapshot, setSnapshot] = useState(card.sync_status ?? null);
  if (snapshot !== (card.sync_status ?? null)) {
    setSnapshot(card.sync_status ?? null);
    setStatus(card.sync_status);
  }

  // Fetch which integrations the org has so the dropdown can disable
  // unconfigured providers. One-shot per panel mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch("/api/integrations");
        if (!resp.ok || cancelled) return;
        const all = (await resp.json()) as IntegrationListItem[];
        setIntegrations(all);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isConfigured = (provider: "jira" | "azure_devops"): boolean =>
    integrations.some((i) => i.provider === provider && i.status === "active");

  const push = async (provider: "jira" | "azure_devops") => {
    setBusy(provider);
    setError(null);
    setOpen(false);
    try {
      const resp = await authFetch(`/api/sync-push-proxy/${card.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error ?? `Push failed (${resp.status})`;
        setError(String(msg));
        return;
      }
      const body = await resp.json();
      setStatus(body.sync_status);
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (choice: "local" | "remote") => {
    if (!status?.link_id) return;
    setBusy(status.provider);
    setError(null);
    try {
      const resp = await authFetch(`/api/sync-resolve-proxy/${status.link_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error ?? `Resolve failed (${resp.status})`;
        setError(String(msg));
        return;
      }
      const body = await resp.json();
      setStatus(body.sync_status);
    } finally {
      setBusy(null);
    }
  };

  // Already synced — show external link, conflict UI when relevant, and a
  // single Re-sync button.
  if (status) {
    const provider = SYNC_PROVIDERS.find((p) => p.id === status.provider) ?? SYNC_PROVIDERS[0];
    const isConflict = status.state === "conflict";
    const stateColor = isConflict
      ? "text-orange-500"
      : status.state === "error"
      ? "text-destructive"
      : status.state === "synced"
      ? "text-emerald-500"
      : "text-muted-foreground";
    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <ProviderMark provider={provider} />
          <div className="min-w-0 flex-1">
            {status.external_url ? (
              <a
                href={status.external_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
              >
                {status.external_key ?? provider.label}
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            ) : (
              <span className="font-medium text-foreground">
                {status.external_key ?? provider.label}
              </span>
            )}
            <div className="mt-0.5 flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${stateColor.replace("text-", "bg-")}`} />
              <span className={stateColor}>{status.state}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => push(status.provider)}
            disabled={busy === status.provider}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Re-sync"
            title="Re-sync"
          >
            {busy === status.provider ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {isConflict && (
          <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-2 space-y-1.5">
            <p className="text-orange-700 dark:text-orange-400">
              Both local and remote changed since last sync.
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === status.provider}
                onClick={() => resolve("local")}
              >
                {busy === status.provider ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                Keep local
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === status.provider}
                onClick={() => resolve("remote")}
              >
                Keep remote
              </Button>
            </div>
          </div>
        )}

        {error && <div className="text-destructive">{error}</div>}
      </div>
    );
  }

  // Not yet synced — single Sync trigger; popover lists both providers with
  // brand marks and an inline Push / Connect action per row.
  const hasAny = SYNC_PROVIDERS.some((p) => isConfigured(p.id));

  return (
    <div ref={ref} className="text-xs">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy !== null}
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground hover:border-ring transition-colors disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-muted-foreground" />
            Push to integration
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          >
            {SYNC_PROVIDERS.map((p) => {
              const configured = isConfigured(p.id);
              const isBusy = busy === p.id;
              return (
                <div
                  key={p.id}
                  role="menuitem"
                  className={`flex items-center gap-2.5 px-2.5 py-2 transition-colors ${
                    configured ? "hover:bg-accent/40" : "bg-muted/20"
                  }`}
                >
                  <ProviderMark provider={p} className={configured ? "" : "opacity-50"} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm font-medium ${
                        configured ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {p.label}
                    </div>
                    {!configured && (
                      <div className="text-[10px] text-muted-foreground">Not connected</div>
                    )}
                  </div>
                  {configured ? (
                    <button
                      type="button"
                      onClick={() => push(p.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      Push
                    </button>
                  ) : (
                    <Link
                      href="/settings"
                      onClick={() => setOpen(false)}
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      Connect →
                    </Link>
                  )}
                </div>
              );
            })}
            {!hasAny && (
              <div className="border-t border-border px-2.5 py-1.5">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Connect an integration →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <div className="mt-1.5 text-destructive">{error}</div>}
    </div>
  );
}

export function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
