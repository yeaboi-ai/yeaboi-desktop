'use client';

// The set-up catalog integrations, beside the other credentials.
//
// Connected-only by construction: the fetch is the default GET
// /api/connections, so a user who has connected nothing reads nothing here —
// the whole roster lives on Settings > Integrations. Rows managed by the
// Credentials cards above (managed_by: "credentials") are filtered out so a
// built-in never renders twice on one page.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { type ConnectionsPayload, loadConnections } from '@/lib/yeaboi/connections';
import { ConnectorSheet, ConnectorTile } from '@/components/yeaboi/connector-sheet';

export function ConnectedIntegrations() {
  const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState('');

  const refresh = useCallback(async () => {
    try {
      setPayload(await loadConnections());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    // Staleness (a backend without the route) and real failures both read
    // muted here: this section is supplementary to the credentials above it.
    return (
      <p role="status" className="mt-6 text-[12px] text-muted-foreground">
        {/404|not found/i.test(error)
          ? 'Your yeaboi backend predates Integrations — update yeaboi to manage those connections here.'
          : `Could not load connections: ${error}`}
      </p>
    );
  }

  const rows = (payload?.connectors ?? []).filter((row) => row.managed_by === 'connections');
  const openRow = rows.find((row) => row.key === openKey) ?? null;
  if (!payload || rows.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
        Connected integrations
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <ConnectorTile key={row.key} row={row} onOpen={() => setOpenKey(row.key)} />
        ))}
      </div>
      <Link
        href="/settings/connections"
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground transition-colors hover:text-primary"
      >
        Browse all integrations
        <ArrowUpRight className="size-3" aria-hidden />
      </Link>
      <ConnectorSheet row={openRow} onClose={() => setOpenKey('')} onChanged={refresh} />
    </div>
  );
}
