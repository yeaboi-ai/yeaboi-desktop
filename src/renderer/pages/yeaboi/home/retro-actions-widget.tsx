'use client';

// What the last retro left behind, on the dashboard. The retro page draws the
// same list beside the way into the next one; here it is the reminder that
// there is something outstanding at all.

import { useEffect, useState } from 'react';

import { openActions, retroHistory, type RetroActionItem } from '@/lib/yeaboi/boards';

const SHOWN = 4;

export function RetroActionsWidget({
  empty: Empty,
}: {
  empty: (props: { children: React.ReactNode }) => React.ReactElement;
}) {
  const [rows, setRows] = useState<RetroActionItem[] | null>(null);

  useEffect(() => {
    retroHistory(1).then(
      (envelope) => setRows(openActions(envelope.data?.latest_report)),
      () => setRows([]),
    );
  }, []);

  if (rows === null) return <Empty>Reading the last retro…</Empty>;
  if (rows.length === 0) return <Empty>Nothing outstanding.</Empty>;

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.slice(0, SHOWN).map((row) => (
        <li key={row.id} className="flex items-baseline gap-2 px-2">
          <span className="min-w-0 flex-1 truncate font-body text-[12px] text-muted-foreground">
            {row.text}
          </span>
          {row.author && (
            <span className="shrink-0 font-code text-[10px] text-muted-foreground/50">
              {row.author}
            </span>
          )}
        </li>
      ))}
      {rows.length > SHOWN && (
        <li className="px-2 font-code text-[10px] text-muted-foreground/50">
          +{rows.length - SHOWN} more
        </li>
      )}
    </ul>
  );
}
