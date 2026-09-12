'use client';

// Provenance — has anyone edited the record, what was decided, and why.
//
// The chain records itself while standups and performance workflows run; until
// now the only way to read it back was the CLI or an MCP client. The order here
// is the audit's own: verification first, because a window of decisions from a
// chain that cannot be trusted is worse than no window at all.

import { useEffect, useState } from 'react';
import { DuckMark } from '@/components/brand/duck';
import {
  type ProvenanceAudit,
  type ProvenanceTrace,
  provenanceAudit,
  provenanceTrace,
} from '@/lib/yeaboi/ops';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Badge } from '@/components/ui/badge';

const WINDOWS = [7, 30, 90];

function Section({
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

function Notice({ title, items }: { title: string; items: string[] }) {
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
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

interface Column {
  header: string;
  numeric?: boolean;
}

function Table({
  columns,
  rows,
  empty,
  caption,
}: {
  columns: Column[];
  rows: { key: string; cells: React.ReactNode[] }[];
  empty?: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-muted-foreground">{empty ?? 'Nothing here.'}</p>;
  }
  return (
    <div className="overflow-x-auto">
      {caption && <p className="text-[11px] text-muted-foreground mb-2">{caption}</p>}
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header || 'blank'}
                className={`py-1 pr-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${column.numeric ? 'text-right' : 'text-left'}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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

function ProvenanceBody() {
  const [windowDays, setWindowDays] = useState(30);
  const [audit, setAudit] = useState<ProvenanceAudit | null>(null);
  const [trace, setTrace] = useState<ProvenanceTrace | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setAudit(null);
    provenanceAudit(windowDays).then(
      (envelope) => setAudit(envelope.data),
      (e: Error) => setError(e.message),
    );
  }, [windowDays]);

  function open(entityId: string) {
    setTrace(null);
    provenanceTrace(entityId).then(
      (envelope) => setTrace(envelope.data),
      (e: Error) => setError(e.message),
    );
  }

  if (error) return <Notice title="Could not read the decision chain" items={[error]} />;
  if (!audit) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Provenance</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            The tamper-evident record of what was decided, by whom, and on what.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                windowDays === days
                  ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </header>

      {audit.warnings.length > 0 && <Notice title="Read this first" items={audit.warnings} />}

      <Section
        title={audit.chain_valid ? 'The record is intact' : 'The record has been changed'}
        actions={
          <Badge variant={audit.chain_valid ? 'default' : 'destructive'}>
            {audit.chain_valid ? 'verified' : 'broken'}
          </Badge>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Decisions recorded" value={String(audit.total_records)} />
          <Tile label="In this window" value={String(audit.window_records)} />
          <Tile label="Breaks" value={String(audit.breaks.length)} />
        </div>
        {audit.breaks.length > 0 && (
          <div className="mt-3">
            <Notice
              title="Where the chain breaks"
              items={audit.breaks.map(
                ([sequence, entity, reason]) => `#${sequence} ${entity}: ${reason}`,
              )}
            />
          </div>
        )}
      </Section>

      {audit.records_by_type.length > 0 && (
        <Section title="What kinds of decisions exist">
          <Table
            columns={[{ header: 'Kind' }, { header: 'Records', numeric: true }]}
            rows={audit.records_by_type.map((row) => ({
              key: row[0],
              cells: [row[0], row[1]],
            }))}
          />
        </Section>
      )}

      <Section title="Lately">
        {audit.recent.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Nothing in this window. Run a standup or a
            performance workflow and the trail starts itself.
          </div>
        ) : (
          <Table
            caption="Newest first. Pick a row to see what it was decided on."
            columns={[
              { header: 'When' },
              { header: 'Entity' },
              { header: 'Decision' },
              { header: 'By' },
              { header: 'Detail' },
            ]}
            rows={audit.recent.map((row) => ({
              key: String(row.sequence_id),
              cells: [
                row.timestamp,
                <button
                  key="entity"
                  type="button"
                  onClick={() => open(row.entity_id)}
                  className="text-primary hover:underline"
                >
                  {row.entity_id}
                </button>,
                row.record_kind,
                `${row.agent_id} (${row.role})`,
                row.detail,
              ],
            }))}
          />
        )}
      </Section>

      {trace && (
        <Section title={`Why: ${trace.entity_id}`}>
          {!trace.found ? (
            <Notice title="Nothing recorded" items={trace.warnings} />
          ) : (
            <ul className="space-y-3">
              {trace.records.map((row) => (
                <li key={row.sequence_id} className="text-[13px] text-foreground">
                  <strong className="font-medium">{row.record_kind}</strong>{' '}
                  <span className="text-muted-foreground">
                    · {row.timestamp} · {row.agent_id}
                  </span>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{row.detail}</p>
                  {row.inputs.length > 0 && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      on: {row.inputs.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

export default function ProvenancePage() {
  return (
    <PageShell>
      <BackendGate>
        <ProvenanceBody />
      </BackendGate>
    </PageShell>
  );
}
