'use client';

// The Agents family's report views, one per kind, plus the small furniture
// they are built from. The machine-wide page (/agents/<kind>) and a project's
// scoped tabs draw the same report the same way.

import { Button } from '@/components/ui/button';
import { SecurityIssues } from '@/components/agents/security-issues';
import type { SecurityActions } from '@/components/agents/use-security-actions';
import type { AgentRunState } from '@/lib/yeaboi/ops';

export type Report = Record<string, unknown>;

const num = (report: Report, field: string): number => Number(report[field] ?? 0);
const text = (report: Report, field: string): string => String(report[field] ?? '');
const rows = (report: Report, field: string): Report[] => (report[field] as Report[]) ?? [];
const lines = (report: Report, field: string): string[] => (report[field] as string[]) ?? [];
const money = (value: number): string => `$${value.toFixed(2)}`;

export function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-body font-medium text-foreground">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">{children}</div>;
}

interface Column {
  header: string;
  numeric?: boolean;
}

function Table({
  columns,
  rows: bodyRows,
  empty,
}: {
  columns: Column[];
  rows: { key: string; cells: React.ReactNode[] }[];
  empty: string;
}) {
  if (bodyRows.length === 0) {
    return <p className="text-[12px] text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header || 'blank'}
                className={`py-1 pr-3 text-[11px] font-medium text-muted-foreground ${column.numeric ? 'text-right' : 'text-left'}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  // eslint-disable-next-line react/no-array-index-key -- cells are positional
                  key={index}
                  className={`py-1.5 pr-3 border-t border-border/40 align-top text-muted-foreground ${columns[index]?.numeric ? 'text-right tabular-nums' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 list-disc pl-4">
      {items.map((line) => (
        <li key={line} className="text-[12px] text-muted-foreground">
          {line}
        </li>
      ))}
    </ul>
  );
}

/** The phase checklist while a pass runs. Nothing until the first line lands. */
export function ScanProgress({ run }: { run: AgentRunState }) {
  if (run.components.length === 0 && run.phases.length === 0) return null;
  return (
    <Section title="Scanning">
      <ul className="space-y-1">
        {run.components.map((component) => (
          <li key={component.component_id} className="text-[12px] text-muted-foreground">
            {component.label}: {component.status}
            {component.total ? ` (${component.current ?? 0}/${component.total})` : ''}
          </li>
        ))}
        {run.phases.map((phase, index) => (
          <li key={`${phase}-${index}`} className="text-[12px] text-muted-foreground">
            {phase}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export interface ReportActions {
  /** Security: the verbs the page acts through (fix, verdict, info toggle). */
  security?: SecurityActions;
}

export function ReportView({
  kind,
  report,
  actions = {},
}: {
  kind: string;
  report: Report;
  actions?: ReportActions;
}) {
  const warnings = lines(report, 'warnings');
  if (kind === 'security') {
    return (
      <>
        {warnings.length > 0 && <Notice title="Read this first" items={warnings} />}
        {actions.security ? (
          <SecurityIssues report={report} actions={actions.security} />
        ) : (
          <SecurityIssues report={report} actions={READ_ONLY} />
        )}
      </>
    );
  }
  return (
    <>
      {warnings.length > 0 && <Notice title="Read this first" items={warnings} />}
      {kind === 'usage' && <UsageView report={report} />}
      {kind === 'advisor' && <AdvisorView report={report} />}
      <Advice report={report} />
    </>
  );
}

// A report drawn with nothing to act through (a saved snapshot): the list
// still reads, the buttons say so instead of failing.
const READ_ONLY: SecurityActions = {
  includeInfo: false,
  busy: false,
  fix: async () => 'Open the Security page to act on this.',
  verdict: async () => 'Open the Security page to act on this.',
  toggleInfo: async () => 'Open the Security page to act on this.',
};

export function billingLabel(kind: string): string {
  if (kind === 'subscription') return 'API-equivalent — included in your subscription, not a bill';
  if (kind === 'api') return 'estimated at public API rates';
  return 'estimated from local session logs at public rates';
}

function TrendBars({ points }: { points: Report[] }) {
  const tail = points.slice(-30);
  const peak = Math.max(0, ...tail.map((p) => Number(p['cost_usd'] ?? 0)));
  if (tail.length === 0) return null;
  return (
    <div>
      <div className="flex items-end gap-[3px] h-14" aria-label="Cost per day">
        {tail.map((p) => {
          const cost = Number(p['cost_usd'] ?? 0);
          const height = peak > 0 ? Math.max(2, Math.round((cost / peak) * 56)) : 2;
          return (
            <div
              key={String(p['date'])}
              title={`${String(p['date'])} · ${money(cost)} · ${Number(p['sessions'] ?? 0)} session(s)`}
              className="flex-1 rounded-sm bg-primary/70"
              style={{ height }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {String(tail[0]?.['date'] ?? '')} → {String(tail[tail.length - 1]?.['date'] ?? '')} · peak{' '}
        {money(peak)} / day
      </p>
    </div>
  );
}

function Advice({ report }: { report: Report }) {
  const insights = lines(report, 'insights');
  const recommendations = lines(report, 'recommendations');
  if (insights.length === 0 && recommendations.length === 0) return null;
  return (
    <Section title="What to do about it">
      <div className="space-y-3">
        {insights.length > 0 && <ReviewList items={insights} />}
        {recommendations.length > 0 && <ReviewList items={recommendations} />}
      </div>
    </Section>
  );
}

function UsageView({ report }: { report: Report }) {
  const cacheShare = num(report, 'cache_cost_share');
  const trend = rows(report, 'daily_trend');
  return (
    <>
      <Section title={`${text(report, 'period_start')} to ${text(report, 'period_end')}`}>
        <Tiles>
          <Tile label="Estimated spend" value={money(num(report, 'total_cost_usd'))} />
          <Tile label="Sessions" value={String(num(report, 'session_count'))} />
          <Tile label="Input tokens" value={num(report, 'total_input_tokens').toLocaleString()} />
          <Tile label="Output tokens" value={num(report, 'total_output_tokens').toLocaleString()} />
        </Tiles>
        <p className="text-[12px] text-muted-foreground">
          {billingLabel(text(report, 'billing_kind'))}. Rates as of{' '}
          {text(report, 'pricing_as_of') || 'unknown'}
          {cacheShare > 0 && ` · ${Math.round(cacheShare * 100)}% of the estimate is cache traffic`}
          .
        </p>
        {trend.length > 1 && (
          <div className="mt-3">
            <TrendBars points={trend} />
          </div>
        )}
      </Section>
      <Section title="By model">
        <Table
          empty="No model activity in the window."
          columns={[
            { header: 'Model' },
            { header: 'Calls', numeric: true },
            { header: 'Cost', numeric: true },
          ]}
          rows={rows(report, 'by_model').map((row) => ({
            key: String(row['model']),
            cells: [String(row['model']), Number(row['calls']), money(Number(row['cost_usd']))],
          }))}
        />
      </Section>
      <Section title="By project">
        <Table
          empty="No project activity in the window."
          columns={[
            { header: 'Project' },
            { header: 'Sessions', numeric: true },
            { header: 'Cost', numeric: true },
          ]}
          rows={rows(report, 'by_project').map((row) => ({
            key: String(row['key']),
            cells: [String(row['key']), Number(row['sessions']), money(Number(row['cost_usd']))],
          }))}
        />
      </Section>
    </>
  );
}

function AdvisorView({ report }: { report: Report }) {
  return (
    <>
      <Section title="Recoverable spend">
        <Tiles>
          <Tile label="Recoverable" value={money(num(report, 'recoverable_usd'))} />
          <Tile
            label="Of window spend"
            value={`${Math.round(num(report, 'recoverable_share') * 100)}%`}
          />
          <Tile label="Window spend" value={money(num(report, 'total_cost_usd'))} />
          <Tile label="Alignment" value={`${num(report, 'alignment_score')}/100`} />
        </Tiles>
      </Section>
      <Section title="Where it went">
        <Table
          empty="Nothing recoverable found."
          columns={[
            { header: 'Mechanism' },
            { header: 'Calls', numeric: true },
            { header: 'Est.', numeric: true },
            { header: 'Note' },
          ]}
          rows={rows(report, 'line_items').map((row) => ({
            key: String(row['mechanism']),
            cells: [
              String(row['label']),
              Number(row['calls']),
              money(Number(row['est_usd'])),
              String(row['note'] ?? ''),
            ],
          }))}
        />
      </Section>
    </>
  );
}
