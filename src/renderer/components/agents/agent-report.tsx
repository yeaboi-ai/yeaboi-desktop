'use client';

// The Agents family's report views, one per kind, plus the small furniture
// they are built from. The machine-wide page (/agents/<kind>) and a project's
// scoped tabs draw the same report the same way.

import { Badge } from '@/components/ui/badge';
import type { AgentRunState } from '@/lib/yeaboi/ops';

export type Report = Record<string, unknown>;

const num = (report: Report, field: string): number => Number(report[field] ?? 0);
const text = (report: Report, field: string): string => String(report[field] ?? '');
const rows = (report: Report, field: string): Report[] => (report[field] as Report[]) ?? [];
const lines = (report: Report, field: string): string[] => (report[field] as string[]) ?? [];
const money = (value: number): string => `$${value.toFixed(2)}`;

type Category = 'todo' | 'inprogress' | 'done' | 'blocked';

function severityCategory(severity: string): Category {
  if (severity === 'critical' || severity === 'high') return 'blocked';
  if (severity === 'medium') return 'inprogress';
  return 'todo';
}

const CATEGORY_VARIANT: Record<Category, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  todo: 'outline',
  inprogress: 'secondary',
  done: 'default',
  blocked: 'destructive',
};

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

export function ReportView({ kind, report }: { kind: string; report: Report }) {
  const warnings = lines(report, 'warnings');
  return (
    <>
      {warnings.length > 0 && <Notice title="Read this first" items={warnings} />}
      {kind === 'usage' && <UsageView report={report} />}
      {kind === 'advisor' && <AdvisorView report={report} />}
      {kind === 'standup' && <StandupView report={report} />}
      {kind === 'security' && <SecurityView report={report} />}
      <Advice report={report} />
    </>
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
          Rates as of {text(report, 'pricing_as_of') || 'unknown'}.
        </p>
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

function StandupView({ report }: { report: Report }) {
  const highlights = lines(report, 'highlights');
  const inFlight = lines(report, 'in_flight');
  const attention = lines(report, 'attention_items');
  const coverage = lines(report, 'coverage_notes');
  return (
    <>
      <Section title={text(report, 'digest_date') || 'Digest'}>
        <Tiles>
          <Tile label="Sessions worked" value={String(num(report, 'sessions_worked'))} />
          <Tile label="Estimated spend" value={money(num(report, 'total_cost_usd'))} />
        </Tiles>
        {text(report, 'narrative') && (
          <p className="text-[13px] text-muted-foreground">{text(report, 'narrative')}</p>
        )}
        {coverage.length > 0 && (
          <div className="mt-3">
            <Notice title="What this could not see" items={coverage} />
          </div>
        )}
      </Section>
      {highlights.length > 0 && (
        <Section title="Highlights">
          <ReviewList items={highlights} />
        </Section>
      )}
      {inFlight.length > 0 && (
        <Section title="Still in flight">
          <ReviewList items={inFlight} />
        </Section>
      )}
      {attention.length > 0 && <Notice title="Needs a person" items={attention} />}
      <Section title="Repo activity">
        <Table
          empty="No tracked repository activity in the window."
          columns={[
            { header: 'Repo' },
            { header: 'Kind' },
            { header: 'What' },
            { header: 'Status' },
          ]}
          rows={rows(report, 'repo_activity').map((row, index) => ({
            key: `${String(row['repo'])}-${index}`,
            cells: [
              String(row['repo']),
              String(row['kind']),
              String(row['title']),
              String(row['status'] ?? ''),
            ],
          }))}
        />
      </Section>
    </>
  );
}

function SecurityView({ report }: { report: Report }) {
  const posture = text(report, 'posture');
  return (
    <>
      <Section
        title={`Posture: ${posture || 'unknown'}`}
        actions={
          <Badge variant={posture === 'good' ? 'default' : 'destructive'}>
            {posture || 'unknown'}
          </Badge>
        }
      >
        <Tiles>
          <Tile label="Sessions scanned" value={String(num(report, 'sessions_scanned'))} />
          <Tile label="Files scanned" value={String(num(report, 'files_scanned'))} />
          <Tile label="Secrets found" value={String(num(report, 'secrets_found'))} />
        </Tiles>
        {text(report, 'summary') && (
          <p className="text-[13px] text-muted-foreground">{text(report, 'summary')}</p>
        )}
      </Section>
      <Section title="Findings">
        <Table
          empty="Nothing flagged."
          columns={[
            { header: 'Severity' },
            { header: 'Finding' },
            { header: 'Where' },
            { header: 'Fix' },
          ]}
          rows={rows(report, 'findings').map((row, index) => ({
            key: `${String(row['title'])}-${index}`,
            cells: [
              <Badge
                key="severity"
                variant={CATEGORY_VARIANT[severityCategory(String(row['severity']))]}
              >
                {String(row['severity'])}
              </Badge>,
              String(row['title']),
              String(row['location'] ?? ''),
              String(row['remediation'] ?? ''),
            ],
          }))}
        />
      </Section>
      <Section title="MCP servers">
        <Table
          empty="No MCP servers configured."
          columns={[
            { header: 'Name' },
            { header: 'Scope' },
            { header: 'Transport' },
            { header: 'Flags' },
          ]}
          rows={rows(report, 'mcp_servers').map((row) => ({
            key: `${String(row['scope'])}/${String(row['name'])}`,
            cells: [
              String(row['name']),
              String(row['scope']),
              String(row['transport']),
              ((row['flags'] as string[]) ?? []).join(', '),
            ],
          }))}
        />
      </Section>
    </>
  );
}
