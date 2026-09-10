// Where exports can go, and what is stopping the ones that cannot.
//
// Destinations are derived from credentials rather than stored, so there is
// nothing to add or delete here — what a person can actually do is set up the
// credential that unblocks one, and that is the button each blocked row gets.
//
// A sidecar that does not serve the browse view returns null and the card is
// simply not rendered: no error, no empty shell.

import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SettingsListRow,
  SettingsSectionHeader,
} from '@/components/settings/primitives';
import { SectionIcon } from '@/components/settings/section-icon';
import { apiGetOptional } from '@/lib/yeaboi/api';

interface DestinationRow {
  key: string;
  label: string;
  description: string;
  blocked: string;
  local: boolean;
  available?: boolean;
  requires?: string[];
  section?: string;
  action?: string;
}

interface DestinationsPayload {
  mode: string;
  destinations: DestinationRow[];
  exports_dir?: string;
}

export function ExportDestinationsCard({ index }: { index?: number }) {
  const [payload, setPayload] = useState<DestinationsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetOptional<DestinationsPayload>('/api/export/destinations?mode=planning&all=1').then(
      (next) => !cancelled && setPayload(next),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload?.destinations?.length) return null;

  return (
    <SettingsCard index={index}>
      <SettingsSectionHeader
        title="Export destinations"
        subtitle="Where a standup, retro or report can be sent"
        icon={<SectionIcon section="sharing" />}
      />
      <div className="py-1.5">
        {payload.destinations.map((row) => {
          const ready = row.available !== false && !row.blocked;
          const detail =
            row.blocked || (row.available === false ? 'Not connected' : row.description);
          return (
            <SettingsListRow
              key={row.key}
              trailing={
                ready ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                    <Check className="size-2.5" aria-hidden="true" />
                    ready
                  </span>
                ) : row.section ? (
                  <Link
                    href={`/settings/credentials?add=${row.section}`}
                    className="inline-flex items-center gap-1 text-[12px] font-body text-primary hover:underline"
                  >
                    Set up
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                ) : null
              }
            >
              <div className="text-[13px] text-foreground">{row.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{detail}</div>
            </SettingsListRow>
          );
        })}
        {payload.exports_dir && (
          <SettingsListRow
            hoverable={false}
            leading={<FolderOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            trailing={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.yeaboi.revealPath(payload.exports_dir!)}
              >
                Reveal
              </Button>
            }
          >
            <div className="text-[11px] text-muted-foreground">Files are written to</div>
            <div className="truncate font-mono text-[11px] text-foreground">
              {payload.exports_dir}
            </div>
          </SettingsListRow>
        )}
      </div>
    </SettingsCard>
  );
}
