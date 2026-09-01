'use client';

// Saved plans — every planning session on this machine, resumable in a click.
// Served by the sessions_list tool (the same rows the TUI's resume list reads).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { callTool } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';

interface SessionRow {
  session_id: string;
  project_name?: string;
  last_node?: string;
  updated_at?: string;
  created_at?: string;
}

function SessionsBody() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    callTool<{ sessions: SessionRow[] }>('sessions_list').then(
      (envelope) => {
        if (!envelope.ok) {
          setError(envelope.error?.message ?? 'sessions_list failed');
          return;
        }
        setRows(envelope.data.sessions ?? []);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error)
    return <p className="text-[13px] text-muted-foreground">Could not load saved plans: {error}</p>;
  if (!rows) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  if (!rows.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        Nothing yet.{' '}
        <Link href="/team/planning" className="text-primary hover:underline">
          Start a plan
        </Link>{' '}
        and it will show up here.
      </p>
    );

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.session_id}>
          <Link
            href={`/team/planning/chat?id=${encodeURIComponent(row.session_id)}`}
            className="block rounded-2xl bg-card ring-1 ring-border/60 px-4 py-3 transition-colors hover:ring-primary/40 hover:bg-secondary/40"
          >
            <strong className="block text-[13px] font-body font-medium text-foreground">
              {row.project_name || 'Untitled plan'}
            </strong>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              {row.last_node ? `${row.last_node} · ` : ''}
              {row.updated_at ?? row.created_at ?? ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SessionsPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">Saved plans</h1>
        <SessionsBody />
      </div>
    </BackendGate>
  );
}
