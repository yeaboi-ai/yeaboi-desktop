'use client';

import { useEffect, useRef, useState, useCallback, useMemo, use } from 'react';
import { apiFetch } from '@/lib/api-base';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useAuthFetch, getStoredTeamId } from '@/hooks/use-auth-fetch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { stampLastViewedProject } from '@/lib/api/teams';
import { X, Trash2, Pencil, ClipboardList, FileText } from 'lucide-react';
import { EditProjectDialog } from '@/components/edit-project-dialog';
import { DashboardGrid } from '@/components/project-layout-grid';
import { HiddenPanelsMenu } from '@/components/layout-toolbar';
import { useDashboardLayout, type DashboardPanelDef } from '@/hooks/use-project-layout';
import { DeliverablesPanel } from '@/components/deliverables/deliverables-panel';
import { DemoTour } from '@/components/onboarding/demo-tour';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  is_own_team?: boolean;
  is_demo?: boolean;
}

interface SessionRow {
  id: string;
  status: string;
  title: string | null;
  initial_idea: string | null;
  created_at: string;
  iteration_id?: string | null;
  blueprint_review_status?: 'none' | 'pending' | 'completed';
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
}

interface BlueprintData {
  project_overview?: string;
  goals_constraints?: string;
  users_personas?: string;
  architecture?: string;
  tech_stack?: string;
  api_integrations?: string;
  ui_ux?: string;
  security_compliance?: string;
  infrastructure?: string;
  open_questions?: string;
  [key: string]: string | undefined;
}

interface BoardCard {
  id: string;
  title: string;
  priority: string | null;
  labels: string[];
  story_points: number | null;
}

interface BoardSummary {
  columns: { name: string; cards: BoardCard[] }[];
}

interface AnalyticsSummary {
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  avg_duration_minutes: number | null;
  avg_blueprint_completion_pct: number;
  total_cards_generated: number;
  total_story_points: number;
  sessions_with_board: number;
  board_generation_rate: number;
  avg_messages_per_session: number;
  avg_participants: number;
  sessions_with_voice: number;
  voice_usage_rate: number;
  persona_distribution: Record<string, number>;
  sessions_timeline: { date: string; sessions: number }[];
}

interface EngMetricsSummary {
  total_committed: number;
  total_done: number;
  total_open: number;
  delivery_rate: number;
  total_prs: number;
  open_by_priority: { priority: string; count: number }[];
}

// ─── Blueprint section labels ─────────────────────────────────────────────────

const BLUEPRINT_SECTIONS: { key: keyof BlueprintData; label: string }[] = [
  { key: 'project_overview', label: 'Overview' },
  { key: 'goals_constraints', label: 'Goals & Constraints' },
  { key: 'users_personas', label: 'Users & Personas' },
  { key: 'team_capacity', label: 'Team & Capacity' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'tech_stack', label: 'Tech Stack' },
  { key: 'api_integrations', label: 'API Integrations' },
  { key: 'ui_ux', label: 'UI / UX' },
  { key: 'security_compliance', label: 'Security & Compliance' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'risks_unknowns', label: 'Risks & Unknowns' },
  { key: 'out_of_scope', label: 'Out of Scope' },
  { key: 'open_questions', label: 'Open Questions' },
];

// Maps iteration types to the subset of sections they focus on
const ITERATION_TYPE_SECTIONS: Record<string, (keyof BlueprintData)[]> = {
  large_feature: BLUEPRINT_SECTIONS.map((s) => s.key),
  small_win: ['project_overview', 'goals_constraints', 'tech_stack', 'ui_ux', 'out_of_scope'],
  bug_fix: ['project_overview', 'architecture', 'risks_unknowns', 'open_questions'],
  spike: ['project_overview', 'goals_constraints', 'open_questions', 'risks_unknowns'],
  refactor: ['architecture', 'tech_stack', 'api_integrations', 'infrastructure'],
  maintenance: ['infrastructure', 'security_compliance', 'risks_unknowns', 'team_capacity'],
};

// Helper: get user-facing release name
function releaseName(iter: { iteration_number: number; display_name?: string | null }): string {
  return iter.display_name || `Release ${iter.iteration_number}`;
}

// ─── DashboardPanel ───────────────────────────────────────────────────────────

function DashboardPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-5 h-full flex flex-col overflow-hidden">
      <h3 className="text-xs font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-4 shrink-0">
        {label}
      </h3>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

// ─── Board Panel Content ──────────────────────────────────────────────────────

const COLUMN_COLORS: Record<string, string> = {
  Backlog: 'bg-muted-foreground/30',
  'To Do': 'bg-blue-500',
  'In Progress': 'bg-yellow-500',
  Review: 'bg-purple-500',
  Done: 'bg-success',
};

const MINI_PRIORITY: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
};

function BoardPanelContent({
  columns,
  projectId,
  layout,
}: {
  columns: { name: string; cards: BoardCard[] }[];
  projectId: string;
  layout: { w: number; h: number };
}) {
  // Measure actual pixel dimensions to pick the right view and card count
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
      setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);
  // Use pixel width: full kanban needs ~700px+, normal needs ~350px+
  const size =
    containerWidth >= 700 ? 'full' : containerWidth >= 350 || layout.h > 3 ? 'normal' : 'small';

  // Progress bar — shared across all sizes
  const progressBar = (
    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-3">
      {columns.map((col) => {
        if (col.cards.length === 0) return null;
        const pct = (col.cards.length / totalCards) * 100;
        return (
          <div
            key={col.name}
            className={`${COLUMN_COLORS[col.name] ?? 'bg-muted-foreground/20'} transition-all`}
            style={{ width: `${pct}%`, minWidth: col.cards.length > 0 ? 4 : 0 }}
            title={`${col.name}: ${col.cards.length}`}
          />
        );
      })}
    </div>
  );

  // Column counts — shared across small & normal
  const columnCounts = (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4">
      {columns.map((col) => (
        <div key={col.name} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${COLUMN_COLORS[col.name] ?? 'bg-muted-foreground/20'}`}
          />
          <span className="text-[11px] font-body text-muted-foreground/70">{col.name}</span>
          <span className="text-[11px] font-body tabular-nums text-muted-foreground/40">
            {col.cards.length}
          </span>
        </div>
      ))}
    </div>
  );

  /* ── Small: progress bar + counts only ─────────────────────────── */
  if (size === 'small') {
    return (
      <div ref={containerRef}>
        {progressBar}
        {columnCounts}
      </div>
    );
  }

  /* ── Full width: mini kanban columns ───────────────────────────── */
  if (size === 'full') {
    // ~60px per card (title + priority row + spacing), ~50px for header+progress
    const maxCards = Math.max(2, Math.floor((containerHeight - 50) / 60));
    return (
      <div ref={containerRef} className="flex flex-col h-full min-h-0">
        {progressBar}
        <div className="flex gap-4 min-h-0 mt-1 flex-1">
          {columns.map((col) => (
            <div key={col.name} className="flex-1 min-w-0 flex flex-col min-h-0">
              {/* Column header */}
              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border/30">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${COLUMN_COLORS[col.name] ?? 'bg-muted-foreground/20'}`}
                />
                <span className="text-[11px] font-body font-medium text-muted-foreground truncate">
                  {col.name}
                </span>
                <span className="text-[10px] font-body tabular-nums text-muted-foreground/40 ml-auto">
                  {col.cards.length}
                </span>
              </div>
              {/* Cards */}
              <div className="space-y-1.5 flex-1 min-h-0">
                {col.cards.slice(0, maxCards).map((card) => (
                  <Link
                    key={card.id}
                    href={`/board?project=${projectId}&card=${card.id}`}
                    className="block rounded-md border border-border/30 bg-card/40 px-2.5 py-1.5 hover:border-border/60 hover:bg-card/70 transition-colors"
                  >
                    <span className="text-[11px] font-body text-foreground/80 line-clamp-2 leading-snug">
                      {card.title}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      {card.priority && (
                        <span
                          className={`inline-flex items-center rounded border px-1 py-px text-[8px] font-semibold uppercase tracking-wide ${MINI_PRIORITY[card.priority] ?? ''}`}
                        >
                          {card.priority.slice(0, 4)}
                        </span>
                      )}
                      {card.labels?.slice(0, 2).map((l) => (
                        <span
                          key={l}
                          className="text-[8px] font-body text-muted-foreground/50 bg-muted/30 rounded px-1 py-px"
                        >
                          {l}
                        </span>
                      ))}
                      {card.story_points != null && (
                        <span className="ml-auto text-[9px] font-body tabular-nums text-muted-foreground/30">
                          {card.story_points}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                {col.cards.length > maxCards && (
                  <Link
                    href={`/board?project=${projectId}`}
                    className="block text-[9px] font-body text-muted-foreground/40 hover:text-muted-foreground pl-1 transition-colors"
                  >
                    +{col.cards.length - maxCards} more
                  </Link>
                )}
                {col.cards.length === 0 && (
                  <p className="text-[10px] font-body text-muted-foreground/15 italic">No cards</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Normal: progress bar + counts + card list ─────────────────── */
  // ~32px per card row + ~60px for progress bar + counts
  const previewCount = Math.max(3, Math.floor((containerHeight - 60) / 32));
  const previewCards = columns
    .filter((col) => col.name !== 'Done')
    .flatMap((col) => col.cards.map((c) => ({ ...c, columnName: col.name })))
    .slice(0, previewCount);

  return (
    <div ref={containerRef}>
      {progressBar}
      {columnCounts}
      {previewCards.length > 0 && (
        <div className="space-y-1.5">
          {previewCards.map((card) => (
            <Link
              key={card.id}
              href={`/board?project=${projectId}&card=${card.id}`}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-card/50 px-2.5 py-1.5 hover:border-border hover:bg-card transition-colors"
            >
              {card.priority && (
                <span
                  className={`shrink-0 inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${MINI_PRIORITY[card.priority] ?? ''}`}
                >
                  {card.priority.slice(0, 4)}
                </span>
              )}
              <span className="text-xs font-body text-foreground/80 truncate">{card.title}</span>
              {card.story_points != null && (
                <span className="ml-auto shrink-0 text-[10px] font-body tabular-nums text-muted-foreground/40">
                  {card.story_points}
                </span>
              )}
            </Link>
          ))}
          {totalCards > previewCards.length && (
            <Link
              href={`/board?project=${projectId}`}
              className="text-[10px] font-body text-muted-foreground/40 hover:text-muted-foreground pl-1 transition-colors"
            >
              +{totalCards - previewCards.length} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AnalyticsPanelContent (responsive) ───────────────────────────────────────

function AnalyticsPanelContent({
  metrics,
  layout,
  eng,
}: {
  metrics: AnalyticsSummary;
  layout: { w: number; h: number };
  eng?: EngMetricsSummary | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size =
    containerWidth >= 700 ? 'full' : containerWidth >= 350 || layout.h > 3 ? 'normal' : 'small';

  const fmtPct = (n: number) => `${Math.round(n)}%`;
  const fmtDur = (mins: number | null) => {
    if (mins === null) return '--';
    if (mins < 1) return '<1m';
    if (mins < 60) return `${Math.round(mins)}m`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const timeline = metrics.sessions_timeline || [];
  const timelineMax = timeline.length > 0 ? Math.max(...timeline.map((t) => t.sessions), 1) : 1;

  // Mini sparkline shared across views
  const sparkline =
    timeline.length > 0 ? (
      <div className="flex items-end gap-px" style={{ height: size === 'full' ? 64 : 32 }}>
        {timeline.map((point, i) => {
          const barH = Math.max((point.sessions / timelineMax) * 100, 4);
          return (
            <div key={i} className="flex-1 group relative" style={{ height: '100%' }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-[#e5a630]/50 rounded-t-sm"
                style={{ height: `${barH}%` }}
              />
              {size === 'full' && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-card border border-border rounded px-1 py-px text-[8px] font-body text-foreground z-10 pointer-events-none">
                  {point.sessions} &middot; {point.date}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  const prioColors: Record<string, string> = {
    critical: 'bg-red-500/80',
    high: 'bg-orange-500/80',
    medium: 'bg-[#e5a630]/80',
    low: 'bg-success/60',
    none: 'bg-muted-foreground/30',
  };

  /* ── Small: hero number + delivery rate + sparkline ──────────── */
  if (size === 'small') {
    return (
      <div ref={containerRef}>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-display text-3xl italic text-foreground leading-none">
            {metrics.total_sessions}
          </span>
          <span className="text-[10px] font-body text-muted-foreground/60">
            session{metrics.total_sessions !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-body text-[#e5a630]">
            {fmtPct(metrics.completion_rate)} completed
          </span>
          {eng && eng.total_committed > 0 && (
            <span className="text-[10px] font-body text-success">
              {Math.round(eng.delivery_rate)}% delivered
            </span>
          )}
        </div>
        {sparkline}
      </div>
    );
  }

  /* ── Full: two-column layout with detailed metrics ─────────── */
  if (size === 'full') {
    return (
      <div ref={containerRef} className="flex flex-col h-full min-h-0">
        {/* Top stats row — larger */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Sessions', value: String(metrics.total_sessions) },
            { label: 'Completion', value: fmtPct(metrics.completion_rate) },
            { label: 'Avg Duration', value: fmtDur(metrics.avg_duration_minutes) },
            { label: 'Blueprint', value: fmtPct(metrics.avg_blueprint_completion_pct) },
            { label: 'Tasks', value: String(metrics.total_cards_generated) },
          ].map(({ label, value }) => (
            <div key={label} className="border border-border/30 rounded-lg px-4 py-3">
              <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-1.5">
                {label}
              </p>
              <span className="font-display text-3xl italic text-foreground leading-none">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Two-column body — fills remaining space */}
        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Left column: delivery + priority + secondary stats */}
          <div className="flex flex-col">
            {/* Delivery progress */}
            {eng && eng.total_committed > 0 ? (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide">
                    Delivery
                  </span>
                  <span className="text-xs font-body text-success">
                    {eng.total_done}/{eng.total_committed} ({Math.round(eng.delivery_rate)}%)
                  </span>
                </div>
                <div className="h-3 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success/70 rounded-full transition-all"
                    style={{ width: `${eng.delivery_rate}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mb-5">
                <span className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide">
                  Delivery
                </span>
                <p className="text-xs font-body text-muted-foreground/40 mt-1">No board data yet</p>
              </div>
            )}

            {/* Open by priority */}
            {eng && eng.open_by_priority.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-3">
                  Open by Priority
                </p>
                <div className="space-y-2.5">
                  {eng.open_by_priority.map((p) => {
                    const maxP = Math.max(...eng.open_by_priority.map((x) => x.count), 1);
                    return (
                      <div key={p.priority} className="flex items-center gap-3">
                        <span className="text-xs font-body text-muted-foreground/60 capitalize w-16 shrink-0">
                          {p.priority}
                        </span>
                        <div className="flex-1 h-2 bg-border/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${prioColors[p.priority] || 'bg-muted-foreground/30'}`}
                            style={{ width: `${(p.count / maxP) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-body tabular-nums text-muted-foreground/50 w-6 text-right">
                          {p.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Secondary stats — larger */}
            <div className="grid grid-cols-2 gap-3 mt-auto">
              {[
                { label: 'Story Points', value: String(metrics.total_story_points) },
                { label: 'Msg / Session', value: metrics.avg_messages_per_session.toFixed(1) },
                { label: 'Voice Usage', value: fmtPct(metrics.voice_usage_rate) },
                { label: 'PRs Merged', value: String(eng?.total_prs ?? 0) },
              ].map(({ label, value }) => (
                <div key={label} className="border border-border/20 rounded-md px-3 py-2">
                  <p className="text-[9px] font-body text-muted-foreground/40 uppercase tracking-wide mb-0.5">
                    {label}
                  </p>
                  <span className="font-display text-lg italic text-foreground/70">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: timeline + persona */}
          <div className="flex flex-col">
            {/* Timeline chart — taller */}
            <div className="mb-5">
              <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-3">
                Sessions over time
              </p>
              {timeline.length > 0 ? (
                <>
                  <div className="flex items-end gap-px" style={{ height: 120 }}>
                    {timeline.map((point, i) => {
                      const barH = Math.max((point.sessions / timelineMax) * 100, 4);
                      return (
                        <div key={i} className="flex-1 group relative" style={{ height: '100%' }}>
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-[#e5a630]/50 hover:bg-[#e5a630] rounded-t-sm transition-colors"
                            style={{ height: `${barH}%` }}
                          />
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-card border border-border rounded px-1 py-px text-[8px] font-body text-foreground z-10 pointer-events-none">
                            {point.sessions} &middot; {point.date}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {timeline.length >= 2 && (
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px] font-body text-muted-foreground/30">
                        {timeline[0].date}
                      </span>
                      <span className="text-[9px] font-body text-muted-foreground/30">
                        {timeline[timeline.length - 1].date}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs font-body text-muted-foreground/40">No timeline data</p>
              )}
            </div>

            {/* Persona distribution — larger */}
            {Object.keys(metrics.persona_distribution).length > 0 && (
              <div>
                <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-3">
                  Personas Used
                </p>
                <div className="space-y-2.5">
                  {Object.entries(metrics.persona_distribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => {
                      const maxPersona = Math.max(
                        ...Object.values(metrics.persona_distribution),
                        1,
                      );
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs font-body text-muted-foreground/60 capitalize w-20 shrink-0 truncate">
                            {name.replace(/_/g, ' ')}
                          </span>
                          <div className="flex-1 h-2 bg-border/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#e5a630]/60 rounded-full"
                              style={{ width: `${(count / maxPersona) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-body tabular-nums text-muted-foreground/50 w-6 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Normal: 2x2 stat grid + delivery + sparkline ────────────── */
  return (
    <div ref={containerRef}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Sessions', value: String(metrics.total_sessions), accent: false },
          { label: 'Completion', value: fmtPct(metrics.completion_rate), accent: true },
          { label: 'Blueprint', value: fmtPct(metrics.avg_blueprint_completion_pct), accent: true },
          { label: 'Tasks', value: String(metrics.total_cards_generated), accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="border border-border/40 rounded-md px-3 py-2">
            <p className="text-[9px] font-body text-muted-foreground/50 uppercase tracking-wide mb-1">
              {label}
            </p>
            <span
              className={`font-display text-2xl italic leading-none ${accent ? 'text-[#e5a630]' : 'text-foreground'}`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      {eng && eng.total_committed > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-body text-muted-foreground/50 uppercase tracking-wide">
              Delivery
            </span>
            <span className="text-[10px] font-body text-success">
              {Math.round(eng.delivery_rate)}%
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-success/70 rounded-full transition-all"
              style={{ width: `${eng.delivery_rate}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-3 text-[10px] font-body text-muted-foreground/50">
        <span>{fmtDur(metrics.avg_duration_minutes)} avg duration</span>
        <span>{metrics.total_story_points} story pts</span>
      </div>
      {sparkline}
    </div>
  );
}

// ─── BlueprintSectionList (expandable) ────────────────────────────────────────

function BlueprintSectionList({
  sections,
  blueprint,
  projectId,
  sessions,
  filledSections,
  focusSections,
}: {
  sections: { key: keyof BlueprintData; label: string }[];
  blueprint: BlueprintData;
  projectId: string;
  sessions: SessionRow[];
  filledSections: number;
  focusSections?: Set<keyof BlueprintData>;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const isWide = containerWidth >= 500;

  return (
    <div ref={containerRef}>
      {/* Compact: one line per section with dot indicator */}
      <div className={isWide ? 'grid grid-cols-2 gap-x-8 gap-y-1.5' : 'space-y-0.5'}>
        {sections.map(({ key, label }) => {
          const content = (blueprint[key] || '').trim();
          const isInherited = focusSections && !focusSections.has(key);
          return (
            <div
              key={key}
              className={`flex items-center gap-2.5 px-1 ${isWide ? 'py-1' : 'py-0.5'}`}
            >
              <span
                className={`${isWide ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full shrink-0 ${
                  isInherited
                    ? 'bg-muted-foreground/15'
                    : content
                      ? 'bg-success/70'
                      : 'bg-primary/40'
                }`}
              />
              <span
                className={`font-body ${
                  isInherited
                    ? 'text-muted-foreground/25'
                    : content
                      ? 'text-foreground/60'
                      : 'text-muted-foreground/40'
                } ${isWide ? 'text-xs' : 'text-[11px]'}`}
              >
                {label}
              </span>
              {isInherited && (
                <span className="text-[8px] font-body text-muted-foreground/20 ml-auto">
                  inherited
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Expand toggle */}
      {filledSections > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[10px] font-body text-primary/60 hover:text-primary transition-colors"
        >
          {expanded ? 'Hide details ↑' : 'Show details ↓'}
        </button>
      )}

      {/* Expanded: show content for filled sections */}
      {expanded && (
        <div className={`mt-2 ${isWide ? 'grid grid-cols-2 gap-3' : 'space-y-1.5'}`}>
          {sections.map(({ key, label }) => {
            const content = (blueprint[key] || '').trim();
            if (!content) return null;
            const isInherited = focusSections && !focusSections.has(key);
            return (
              <div
                key={key}
                className={`rounded-md px-3 py-2 ${isInherited ? 'bg-white/[0.01] opacity-50' : 'bg-white/[0.03]'}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-body font-medium text-foreground/40 uppercase tracking-wider ${isWide ? 'text-[10px]' : 'text-[9px]'}`}
                  >
                    {label}
                  </span>
                  {isInherited && (
                    <span className="text-[8px] font-body text-muted-foreground/30">inherited</span>
                  )}
                </div>
                <p
                  className={`font-body text-foreground/70 leading-relaxed mt-0.5 ${isWide ? 'text-xs line-clamp-5' : 'text-[11px] line-clamp-3'}`}
                >
                  {content}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Continue planning link */}
      {sessions.length > 0 && filledSections < sections.length && (
        <div className="mt-3 pt-3 border-t border-border">
          <Link
            href={`/projects/${projectId}/sessions/${sessions[0]?.id}`}
            className="text-[10px] font-body text-primary/70 hover:text-primary transition-colors"
          >
            Continue planning →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── SessionItem ──────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: SessionRow;
  projectId: string;
  isAdmin: boolean;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newTitle: string) => void;
  iterationLabel?: string | null;
  isCompletingSession?: boolean;
}

function SessionItem({
  session: s,
  projectId,
  isAdmin,
  onDelete,
  onRename,
  iterationLabel,
  isCompletingSession,
}: SessionItemProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const statusDot: Record<string, string> = {
    live: 'bg-success',
    paused: 'bg-yellow-500',
    completed: 'bg-purple-500',
    archived: 'bg-muted-foreground/20',
    created: 'bg-muted-foreground/30',
    lobby: 'bg-blue-500',
  };

  const isActive = s.status === 'live' || s.status === 'lobby';
  const isCompletedView = s.status === 'completed' || s.status === 'archived';
  const sessionHref = isCompletedView
    ? `/projects/${projectId}/sessions/${s.id}/completed`
    : `/projects/${projectId}/sessions/${s.id}`;

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraft(s.title || '');
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== s.title) onRename(s.id, trimmed);
    setEditing(false);
  }

  return (
    <div className="relative group">
      <Link
        href={sessionHref}
        className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-card/60 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
              statusDot[s.status] ?? 'bg-muted-foreground/30'
            }`}
          />
          {editing ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={saveEdit}
              onClick={(e) => e.preventDefault()}
              autoFocus
              className="text-xs font-body text-foreground bg-card border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary/50 w-40"
            />
          ) : (
            <>
              <span className="text-xs font-body text-foreground truncate">
                {s.title || 'Untitled session'}
              </span>
              {iterationLabel && (
                <span
                  className={`text-[8px] font-body font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    isCompletingSession
                      ? 'bg-primary/20 text-primary/80 border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground/40'
                  }`}
                  title={
                    isCompletingSession
                      ? `Completed ${iterationLabel} — deleting this will remove ${iterationLabel} and all versions based on it`
                      : `Contributed to ${iterationLabel}`
                  }
                >
                  {iterationLabel}
                </span>
              )}
              {s.blueprint_review_status === 'pending' && (
                <span
                  className="text-[9px] font-body font-medium px-1.5 py-0.5 rounded shrink-0 bg-warning/10 text-warning/90 border border-warning/30"
                  title="Pending blueprint review — open the session to resolve queued suggestions"
                >
                  Pending review
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && <span className="text-[10px] font-body text-primary/70">Resume →</span>}
          <span className="text-[10px] font-body text-muted-foreground/40 tabular-nums group-hover:hidden">
            {new Date(s.created_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`${sessionHref}?recap=1`);
            }}
            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
            title="View session recap"
          >
            <ClipboardList className="w-2.5 h-2.5" />
          </button>
          {isAdmin && (
            <button
              onClick={startEdit}
              className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
              title="Rename session"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={(e) => onDelete(s.id, e)}
              className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete session"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { authFetch, ready } = useAuthFetch();
  const confirm = useConfirm();

  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Panel data
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [boardSummary, setBoardSummary] = useState<BoardSummary | null>(null);
  const [analyticsMetrics, setAnalyticsMetrics] = useState<AnalyticsSummary | null>(null);
  const [engMetrics, setEngMetrics] = useState<EngMetricsSummary | null>(null);
  const [diagrams, setDiagrams] = useState<
    Array<{
      session_id: string;
      session_title: string | null;
      diagram: {
        type: string;
        title?: string;
        nodes?: unknown[];
        tables?: unknown[];
        screens?: unknown[];
      };
      created_at: string | null;
    }>
  >([]);
  const [iterations, setIterations] = useState<
    Array<{
      id: string;
      iteration_number: number;
      label: string;
      display_name?: string | null;
      status: string;
      iteration_type?: string | null;
      forked_from_id?: string | null;
      yeaboi_session_id?: string | null;
      plan_generated_at?: string | null;
    }>
  >([]);
  const [activeIterationId, setActiveIterationId] = useState<string | null>(null);

  // Dashboard layout customisation
  const dashboardPanels: DashboardPanelDef[] = useMemo(
    () => [
      { id: 'sessions', label: 'Sessions' },
      { id: 'blueprint', label: 'Blueprint' },
      { id: 'plan', label: 'Plan' },
      { id: 'diagrams', label: 'Diagrams' },
      { id: 'board', label: 'Board' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'repository', label: 'Repository' },
    ],
    [],
  );

  const {
    layouts: dashboardLayouts,
    hiddenPanels: hiddenPanelDefs,
    onLayoutChange,
    hidePanel,
    showPanel,
    toggleExpand,
    isExpanded,
    visiblePanels,
  } = useDashboardLayout(dashboardPanels, `project_dashboard_layout_${id}`);

  // Get board panel dimensions for size-responsive rendering
  const boardLayout = useMemo(() => {
    const lg = dashboardLayouts.lg;
    if (!lg) return { w: 1, h: 3 };
    const item = lg.find((i: { i: string }) => i.i === 'board');
    return item ? { w: item.w, h: item.h } : { w: 1, h: 3 };
  }, [dashboardLayouts]);

  const analyticsLayout = useMemo(() => {
    const lg = dashboardLayouts.lg;
    if (!lg) return { w: 1, h: 3 };
    const item = lg.find((i: { i: string }) => i.i === 'analytics');
    return item ? { w: item.w, h: item.h } : { w: 1, h: 3 };
  }, [dashboardLayouts]);

  const sessionsLayout = useMemo(() => {
    const lg = dashboardLayouts.lg;
    if (!lg) return { w: 1, h: 3 };
    const item = lg.find((i: { i: string }) => i.i === 'sessions');
    return item ? { w: item.w, h: item.h } : { w: 1, h: 3 };
  }, [dashboardLayouts]);

  useEffect(() => {
    if (!ready) return;

    async function load() {
      const [
        projectResp,
        sessionsResp,
        teamResp,
        blueprintResp,
        boardResp,
        iterResp,
        diagramsResp,
        analyticsResp,
        engResp,
      ] = await Promise.all([
        authFetch(`/api/projects/${id}`),
        authFetch(`/api/projects/${id}/sessions`),
        authFetch('/api/team'),
        authFetch(`/api/projects/${id}/blueprint`),
        authFetch(`/api/board-proxy?projectId=${id}`),
        authFetch(`/api/projects/${id}/iterations`),
        authFetch(`/api/projects/${id}/diagrams`),
        authFetch(`/api/analytics-proxy?endpoint=aggregate&projectId=${id}`),
        authFetch(`/api/analytics-proxy?endpoint=engineering&projectId=${id}`),
      ]);

      if (!projectResp.ok) {
        setNotFound(true);
        return;
      }
      setProject(await projectResp.json());

      if (sessionsResp.ok) setSessions(await sessionsResp.json());

      if (blueprintResp.ok) {
        const bp = await blueprintResp.json();
        setBlueprint(bp.content || bp);
      }

      if (boardResp.ok) setBoardSummary(await boardResp.json());

      if (diagramsResp.ok) setDiagrams(await diagramsResp.json());

      if (iterResp.ok) {
        const iters = await iterResp.json();
        setIterations(iters);
        // Default to the latest unlocked, or the last one
        const active =
          iters.find((i: { status: string }) => i.status === 'planning') || iters[iters.length - 1];
        if (active) setActiveIterationId(active.id);
      }

      if (analyticsResp.ok) setAnalyticsMetrics(await analyticsResp.json());
      if (engResp.ok) setEngMetrics(await engResp.json());

      // Check admin status — try team members first, fall back to org members
      const meResp = await apiFetch('/api/me');
      if (meResp.ok) {
        const me = await meResp.json();
        let admin = false;
        if (teamResp.ok) {
          const members: TeamMember[] = await teamResp.json();
          const member = members.find((m) => m.email === me.email);
          if (member) admin = member.role === 'admin';
        }
        // Fallback: check org membership if team check didn't find us
        if (!admin) {
          const orgId =
            me.org_id ||
            (typeof window !== 'undefined' ? localStorage.getItem('current_org_id') : null);
          if (orgId) {
            const orgResp = await authFetch(`/api/orgs/${orgId}/members`);
            if (orgResp.ok) {
              const orgMembers = await orgResp.json();
              const orgMember = orgMembers.find((m: { email: string }) => m.email === me.email);
              if (orgMember) admin = orgMember.role === 'admin';
            }
          }
        }
        setIsAdmin(admin);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready]);

  // Stamp the active team's last-viewed project whenever the loaded project changes.
  // The helper is debounced (5 min) and fails silently on 4xx / network errors.
  useEffect(() => {
    if (!project?.id || !ready) return;
    const teamId = getStoredTeamId();
    if (!teamId) return;
    void stampLastViewedProject({ teamId, projectId: project.id, authFetch });
  }, [project?.id, ready, authFetch]);

  const handleDeleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if this is a completing session (deleting it cascade-deletes the iteration)
      const targetSession = sessions.find((s) => s.id === sessionId);
      const completingIter =
        targetSession?.status === 'completed' && targetSession?.iteration_id
          ? iterations.find((i) => i.id === targetSession.iteration_id && i.status === 'locked')
          : null;

      const ok = await confirm({
        title: completingIter
          ? `Delete Session & ${releaseName(completingIter)}`
          : 'Delete Session',
        message: completingIter
          ? `This session finalized ${releaseName(completingIter)}. Deleting it will also delete ${releaseName(completingIter)}, all releases based on it, and any attached sessions.`
          : 'Delete this session and all its messages? Any blueprint changes made during this session will be reverted.',
        variant: 'danger',
        confirmLabel: completingIter ? `Delete Session & ${releaseName(completingIter)}` : 'Delete',
      });
      if (!ok) return;
      const resp = await authFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (resp.ok || resp.status === 204) {
        // Cascade may have deleted other sessions too — refetch everything
        if (completingIter) {
          const [sessResp, bpResp, iterResp] = await Promise.all([
            authFetch(`/api/projects/${id}/sessions`),
            authFetch(`/api/projects/${id}/blueprint`),
            authFetch(`/api/projects/${id}/iterations`),
          ]);
          if (sessResp.ok) setSessions(await sessResp.json());
          if (bpResp.ok) {
            const bp = await bpResp.json();
            setBlueprint(bp.content || bp);
          }
          if (iterResp.ok) {
            const iters = await iterResp.json();
            setIterations(iters);
            setActiveIterationId(iters[iters.length - 1]?.id || null);
          }
        } else {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          const bpResp = await authFetch(`/api/projects/${id}/blueprint`);
          if (bpResp.ok) {
            const bp = await bpResp.json();
            setBlueprint(bp.content || bp);
          }
        }
      }
    },
    [authFetch, confirm, sessions, iterations],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      const resp = await authFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s)),
        );
      }
    },
    [authFetch],
  );

  const handleDeleteProject = useCallback(async () => {
    const ok = await confirm({
      title: 'Delete Project',
      message: 'Delete this project and all its sessions? This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    let resp: Response;
    try {
      resp = await authFetch(`/api/projects/${id}`, { method: 'DELETE' });
    } catch {
      await confirm({
        title: 'Delete failed',
        message: 'Could not reach the server. Check your connection and try again.',
        variant: 'warning',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
      return;
    }
    if (resp.ok || resp.status === 204) {
      router.push('/projects');
      return;
    }
    let detail = `Delete failed with status ${resp.status}.`;
    try {
      const body = await resp.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response had no JSON body — keep the status-only message
    }
    await confirm({
      title: 'Delete failed',
      message: detail,
      variant: 'warning',
      confirmLabel: 'OK',
      cancelLabel: 'Close',
    });
  }, [id, authFetch, router, confirm]);

  // ── Loading / not found ────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Project not found.
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const formatted = new Date(project.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const activeSessions = sessions.filter(
    (s) => s.status === 'live' || s.status === 'lobby' || s.status === 'paused',
  );

  // Filter sections by active iteration type
  const activeIter = iterations.find((i) => i.id === activeIterationId);
  const isV2Plus = activeIter && activeIter.forked_from_id;
  const typeFilter =
    activeIter?.iteration_type && ITERATION_TYPE_SECTIONS[activeIter.iteration_type];
  // For v2+ with a type: show ALL sections but mark focus vs inherited
  // For v2+ without a type: show placeholder
  // For v1: show all sections normally
  const focusSectionKeys = typeFilter ? new Set(typeFilter) : undefined;
  const visibleSections = BLUEPRINT_SECTIONS;
  const v2NoType = isV2Plus && !activeIter?.iteration_type;

  // Blueprint fill: count only focus sections (or all if no type filter)
  const countSections = typeFilter
    ? BLUEPRINT_SECTIONS.filter((s) => typeFilter.includes(s.key))
    : BLUEPRINT_SECTIONS;
  const filledSections = blueprint
    ? countSections.filter((s) => blueprint[s.key]?.trim()).length
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-14">
        {/* Breadcrumb */}
        <div className="mb-8 animate-fade-in">
          <Link
            href="/projects"
            className="text-xs font-body text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Projects
          </Link>
        </div>

        {/* Project masthead */}
        <div className="flex items-start gap-12 mb-12 animate-slide-up stagger-1">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
              Project
            </p>
            <div className="flex items-baseline gap-3 mb-4">
              <h1 className="font-display text-5xl italic leading-[1.08] text-foreground">
                {project.name}
              </h1>
              {project.is_own_team === false && (
                <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Read-only
                </span>
              )}
              {isAdmin && project.is_own_team !== false && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-body text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  title="Edit project"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground font-body leading-relaxed max-w-xl">
                {project.description}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right hidden md:block">
            <p className="text-xs text-muted-foreground/60 font-body tabular-nums">{formatted}</p>
            <div className="mt-3 flex items-center gap-2 justify-end">
              <Badge variant="secondary" className="font-body text-[10px] tracking-wide">
                {sessions.length === 0
                  ? 'No sessions yet'
                  : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
              </Badge>
              {isAdmin && project.is_own_team !== false && (
                <button
                  onClick={handleDeleteProject}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-body text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete project"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-10 animate-fade-in stagger-2 relative z-[100]">
          <div className="h-px bg-border flex-1" />
          {hiddenPanelDefs.length > 0 && (
            <div className="ml-4">
              <HiddenPanelsMenu hiddenPanels={hiddenPanelDefs} onShow={showPanel} />
            </div>
          )}
        </div>

        {/* Active sessions — prominent at the top */}
        {activeSessions.length > 0 && (
          <div className="mb-8 animate-slide-up stagger-3">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
              Active Now
            </p>
            <div className="flex flex-wrap gap-2">
              {activeSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/projects/${project.id}/sessions/${s.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-xs font-body text-primary hover:border-primary/60 hover:bg-primary/10 transition-colors"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                  {s.title || 'Active session'}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Customisable Dashboard grid */}
        <div className="mb-10 animate-slide-up stagger-3">
          <DashboardGrid
            layouts={dashboardLayouts}
            onLayoutChange={onLayoutChange}
            visiblePanelIds={visiblePanels.map((p) => p.id)}
            onHide={hidePanel}
            onToggleExpand={toggleExpand}
            isExpanded={isExpanded}
          >
            {/* Panel: Releases */}
            <div key="sessions" className="h-full">
              <DashboardPanel label="Releases">
                {sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 font-body">No sessions yet.</p>
                ) : sessionsLayout.w >= 12 ? (
                  /* ── Full width: two-column with stats ─────────────── */
                  <div className="grid grid-cols-[1fr_auto] gap-6 mb-3">
                    <div className="space-y-1">
                      {sessions.map((s) => {
                        const boundIter = s.iteration_id
                          ? iterations.find((i) => i.id === s.iteration_id)
                          : null;
                        const rName = boundIter ? releaseName(boundIter) : null;
                        const isCompleting =
                          boundIter?.status === 'locked' && s.status === 'completed';
                        return (
                          <SessionItem
                            key={s.id}
                            session={s}
                            projectId={project.id}
                            isAdmin={isAdmin}
                            onDelete={handleDeleteSession}
                            onRename={handleRenameSession}
                            iterationLabel={rName}
                            isCompletingSession={isCompleting}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-3 pr-2 shrink-0 min-w-[140px]">
                      <div className="border border-border/30 rounded-lg px-4 py-3">
                        <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-1">
                          Total
                        </p>
                        <span className="font-display text-3xl italic text-foreground leading-none">
                          {sessions.length}
                        </span>
                      </div>
                      <div className="border border-border/30 rounded-lg px-4 py-3">
                        <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-1">
                          Active
                        </p>
                        <span className="font-display text-3xl italic text-success leading-none">
                          {
                            sessions.filter((s) => s.status === 'live' || s.status === 'lobby')
                              .length
                          }
                        </span>
                      </div>
                      <div className="border border-border/30 rounded-lg px-4 py-3">
                        <p className="text-[10px] font-body text-muted-foreground/50 uppercase tracking-wide mb-1">
                          Completed
                        </p>
                        <span className="font-display text-3xl italic text-[#e5a630] leading-none">
                          {sessions.filter((s) => s.status === 'completed').length}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Normal: compact list ──────────────────────────── */
                  <div className="space-y-0.5 mb-3">
                    {sessions.slice(0, sessionsLayout.h > 4 ? 12 : 8).map((s) => {
                      const boundIter = s.iteration_id
                        ? iterations.find((i) => i.id === s.iteration_id)
                        : null;
                      const rName = boundIter ? releaseName(boundIter) : null;
                      const isCompleting =
                        boundIter?.status === 'locked' && s.status === 'completed';
                      return (
                        <SessionItem
                          key={s.id}
                          session={s}
                          projectId={project.id}
                          isAdmin={isAdmin}
                          onDelete={handleDeleteSession}
                          onRename={handleRenameSession}
                          iterationLabel={rName}
                          isCompletingSession={isCompleting}
                        />
                      );
                    })}
                    {sessions.length > (sessionsLayout.h > 4 ? 12 : 8) && (
                      <p className="text-[10px] font-body text-muted-foreground/40 px-3 pt-1">
                        +{sessions.length - (sessionsLayout.h > 4 ? 12 : 8)} more
                      </p>
                    )}
                  </div>
                )}
                {project.is_own_team !== false && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <Link
                      href={`/projects/${project.id}/sessions/new`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    >
                      + New Release
                    </Link>
                  </div>
                )}
              </DashboardPanel>
            </div>

            {/* Panel: Blueprint */}
            <div key="blueprint" className="h-full">
              <DashboardPanel label="Blueprint">
                {blueprint === null ? (
                  <p className="text-xs text-muted-foreground/50 font-body">Loading…</p>
                ) : (
                  <>
                    {/* Release timeline + open-blueprint link. The link lives on
                    the trailing edge of the same row so it shares vertical
                    space with the release pills (and avoids the panel's
                    expand/hide chrome icons in the panel corner). */}
                    <div className="flex items-center gap-0 mb-4 overflow-x-auto">
                      {iterations.map((iter, idx) => {
                        const active = iter.id === activeIterationId;
                        const isFinalized = iter.status === 'locked';
                        const isReady = iter.status === 'ready';
                        const name = releaseName(iter);
                        return (
                          <div key={iter.id} className="flex items-center shrink-0">
                            {idx > 0 && <div className="w-4 h-px bg-border/40" />}
                            <button
                              onClick={async () => {
                                setActiveIterationId(iter.id);
                                const resp = await authFetch(
                                  `/api/projects/${id}/blueprint?iteration_id=${iter.id}`,
                                );
                                if (resp.ok) {
                                  const bp = await resp.json();
                                  setBlueprint(bp.content || bp);
                                }
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-body font-medium transition-all ${
                                active
                                  ? 'bg-primary/15 text-primary border border-primary/30'
                                  : 'text-muted-foreground/50 hover:text-foreground/70 hover:bg-card/60'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isFinalized
                                    ? 'bg-success'
                                    : isReady
                                      ? 'bg-blue-400'
                                      : 'bg-amber-400'
                                }`}
                              />
                              {name}
                              {isFinalized && (
                                <span className="text-[8px] text-success/60">Finalized</span>
                              )}
                              {isReady && (
                                <span className="text-[8px] text-blue-400/60">Ready</span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                      <Link
                        href={`/projects/${project.id}/blueprint`}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-body font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                        title="Open the full blueprint document"
                      >
                        <FileText className="h-3 w-3" />
                        Open
                      </Link>
                    </div>

                    {/* v2+ without type chosen yet — show placeholder */}
                    {v2NoType ? (
                      <div className="py-6 text-center">
                        <p className="text-[11px] font-body text-muted-foreground/50 mb-1">
                          No release type selected yet
                        </p>
                        <p className="text-[10px] font-body text-muted-foreground/30">
                          Start a new session and choose a type to see which sections this release
                          will cover.
                        </p>
                        <Link
                          href={`/projects/${project.id}/sessions/new`}
                          className="inline-block mt-3 text-[10px] font-body font-medium text-primary/70 hover:text-primary transition-colors"
                        >
                          Start session →
                        </Link>
                      </div>
                    ) : (
                      <>
                        {/* Progress header — scales with layout */}
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`relative shrink-0 ${'w-12 h-12'}`}>
                            <svg className={`${'w-12 h-12'} -rotate-90`} viewBox="0 0 36 36">
                              <circle
                                cx="18"
                                cy="18"
                                r="15"
                                fill="none"
                                stroke="currentColor"
                                className="text-white/[0.06]"
                                strokeWidth="3"
                              />
                              <circle
                                cx="18"
                                cy="18"
                                r="15"
                                fill="none"
                                stroke="currentColor"
                                className={
                                  filledSections === countSections.length
                                    ? 'text-success'
                                    : 'text-primary'
                                }
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray={`${(filledSections / countSections.length) * 94.2} 94.2`}
                              />
                            </svg>
                            <span
                              className={`absolute inset-0 flex items-center justify-center font-bold text-foreground/70 ${'text-xs'}`}
                            >
                              {filledSections}
                            </span>
                          </div>
                          <div>
                            <p className={`font-body font-medium text-foreground/80 ${'text-sm'}`}>
                              {filledSections === countSections.length
                                ? 'Blueprint complete'
                                : filledSections === 0
                                  ? 'No sections filled yet'
                                  : `${filledSections} of ${countSections.length} sections`}
                            </p>
                            <p className={`font-body text-muted-foreground/40 ${'text-xs'}`}>
                              {filledSections === countSections.length
                                ? 'Ready to generate board'
                                : `${countSections.length - filledSections} remaining`}
                            </p>
                          </div>
                        </div>

                        {/* Compact section list — expandable */}
                        <BlueprintSectionList
                          sections={visibleSections}
                          blueprint={blueprint}
                          projectId={project.id}
                          sessions={sessions}
                          filledSections={filledSections}
                          focusSections={focusSectionKeys}
                        />
                      </>
                    )}

                    {/* Plan Next Release button */}
                    {iterations.length > 0 && iterations.every((i) => i.status === 'locked') && (
                      <button
                        onClick={async () => {
                          const currentName = releaseName(iterations[iterations.length - 1]);
                          const nextNum = iterations.length + 1;
                          const ok = await confirm({
                            title: 'Plan Next Release',
                            message: `${currentName} is finalized. Create Release ${nextNum} based on it?`,
                            confirmLabel: `Create Release ${nextNum}`,
                            cancelLabel: 'Cancel',
                          });
                          if (!ok) return;

                          const resp = await authFetch(`/api/projects/${project.id}/iterations`, {
                            method: 'POST',
                          });
                          if (resp.ok) {
                            const newIter = await resp.json();
                            setIterations((prev) => [...prev, newIter]);
                            setActiveIterationId(newIter.id);
                            const bpResp = await authFetch(
                              `/api/projects/${id}/blueprint?iteration_id=${newIter.id}`,
                            );
                            if (bpResp.ok) {
                              const bp = await bpResp.json();
                              setBlueprint(bp.content || bp);
                            }
                          }
                        }}
                        className="mt-3 w-full text-xs font-body font-medium text-primary/80 hover:text-primary px-3 py-2 rounded-md border border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        + Plan Next Release
                      </button>
                    )}
                  </>
                )}
              </DashboardPanel>
            </div>

            {/* Panel: Plan — the yeaboi engine's plan for the current iteration */}
            <div key="plan" className="h-full">
              <DashboardPanel label="Plan">
                {(() => {
                  const current = iterations[iterations.length - 1];
                  const generated = current?.yeaboi_session_id;
                  return (
                    <>
                      {generated ? (
                        <p className="text-xs text-muted-foreground/50 font-body mb-3">
                          Plan generated
                          {current?.plan_generated_at
                            ? ` ${String(current.plan_generated_at).slice(0, 10)}`
                            : ''}{' '}
                          — epics, stories, tasks and sprints from the blueprint.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 font-body mb-3">
                          No plan yet. Fill in the blueprint, then generate — stories land on the
                          board.
                        </p>
                      )}
                      <div className="mt-3 pt-3 border-t border-border">
                        <Link
                          href={`/projects/${project.id}/plan`}
                          className="text-xs font-body text-muted-foreground/60 hover:text-foreground transition-colors"
                        >
                          {generated ? 'Open the plan →' : 'Generate a plan →'}
                        </Link>
                      </div>
                    </>
                  );
                })()}
              </DashboardPanel>
            </div>

            {/* Panel: Diagrams */}
            <div key="diagrams" className="h-full">
              <DashboardPanel label="Diagrams">
                {diagrams.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 font-body">
                    No diagrams yet. Start a session and ask for a flow, architecture, or ERD
                    diagram.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {diagrams.slice(0, 6).map((d) => {
                      const typeLabels: Record<string, string> = {
                        flow: 'User Flow',
                        architecture: 'Architecture',
                        erd: 'Data Model',
                        wireframe: 'Wireframes',
                      };
                      const typeColors: Record<string, string> = {
                        flow: 'text-blue-400',
                        architecture: 'text-success',
                        erd: 'text-violet-400',
                        wireframe: 'text-amber-400',
                      };
                      const nodeCount =
                        d.diagram.nodes?.length ??
                        d.diagram.tables?.length ??
                        d.diagram.screens?.length ??
                        0;
                      return (
                        <Link
                          key={d.session_id}
                          href={`/projects/${project?.id}/sessions/${d.session_id}`}
                          className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/[0.03] transition-colors group"
                        >
                          <div className="min-w-0">
                            <span
                              className={`text-[10px] font-body font-medium uppercase tracking-wide ${typeColors[d.diagram.type] ?? 'text-white/50'}`}
                            >
                              {typeLabels[d.diagram.type] ?? d.diagram.type}
                            </span>
                            <p className="text-xs font-body text-foreground/80 truncate">
                              {d.diagram.title || d.session_title || 'Untitled'}
                            </p>
                          </div>
                          <span className="text-[10px] font-body text-muted-foreground/40 shrink-0 ml-2">
                            {nodeCount} nodes
                          </span>
                        </Link>
                      );
                    })}
                    {diagrams.length > 6 && (
                      <p className="text-[10px] font-body text-muted-foreground/40 px-3">
                        +{diagrams.length - 6} more
                      </p>
                    )}
                  </div>
                )}
              </DashboardPanel>
            </div>

            {/* Panel: Board */}
            <div key="board" className="h-full">
              <DashboardPanel label="Board">
                {boardSummary === null ? (
                  <p className="text-xs text-muted-foreground/50 font-body">Loading…</p>
                ) : boardSummary.columns?.length > 0 ? (
                  <BoardPanelContent
                    columns={boardSummary.columns}
                    projectId={project.id}
                    layout={boardLayout}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground/50 font-body mb-3">No tasks yet.</p>
                )}
                <div className="mt-3 pt-3 border-t border-border">
                  <Link
                    href={`/projects/${project.id}/board`}
                    className="text-xs font-body text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    Open in board →
                  </Link>
                </div>
              </DashboardPanel>
            </div>

            {/* Panel: Analytics */}
            <div key="analytics" className="h-full">
              <DashboardPanel label="Analytics">
                {analyticsMetrics === null ? (
                  <p className="text-xs text-muted-foreground/50 font-body">Loading…</p>
                ) : analyticsMetrics.total_sessions === 0 ? (
                  <p className="text-xs text-muted-foreground/50 font-body mb-3">
                    No session data yet.
                  </p>
                ) : (
                  <AnalyticsPanelContent
                    metrics={analyticsMetrics}
                    layout={analyticsLayout}
                    eng={engMetrics}
                  />
                )}
                <div className="mt-3 pt-3 border-t border-border">
                  <Link
                    href={`/projects/${project.id}/analytics`}
                    className="text-xs font-body text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    Open analytics →
                  </Link>
                </div>
              </DashboardPanel>
            </div>

            {/* Panel: Repository */}
            <div key="repository" className="h-full">
              <DashboardPanel label="Repository">
                <DeliverablesPanel projectId={id} />
              </DashboardPanel>
            </div>
          </DashboardGrid>
        </div>
      </main>

      {project && (
        <EditProjectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          onSaved={(data) =>
            setProject({ ...project, ...data, description: data.description ?? null })
          }
        />
      )}

      {project?.is_demo && <DemoTour />}
    </div>
  );
}
