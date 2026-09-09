// The one chip every surface uses to say how a connection is doing.
//
// It never verifies on its own. Probing is a network round trip to a vendor
// with the person's credentials, and doing that whenever a settings page opens
// is a cost and a rate limit nobody asked for — so re-testing is a button.
//
// It also never hides the age of an "ok". "verified 2m ago" is a fact about
// the past; a token revoked since is still shown as verified, and showing when
// is what keeps that honest.

import { Check, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type ConnectionStatus, resolveStatus } from '@/lib/yeaboi/connection-status';
import { cn } from '@/lib/utils';

const TONE = {
  muted: 'bg-muted/40 text-muted-foreground',
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
} as const;

export function ConnectionStatusChip({
  configured,
  status,
  now,
  onRetest,
  busy,
  label,
  className,
  probeable = true,
}: {
  configured: boolean;
  status?: ConnectionStatus;
  /** Injectable so a test can pin the age. */
  now?: Date;
  /** Given only when a probe exists — a kind with no probe gets no button. */
  onRetest?: () => void;
  busy?: boolean;
  /** What the re-test button announces, e.g. "ElevenLabs". */
  label?: string;
  className?: string;
  /** False when this connection has no live probe: it can never leave
   *  "not tested", and a grey chip saying so reads as a fault. */
  probeable?: boolean;
}) {
  const resolved = resolveStatus({ configured, status }, now ?? new Date());
  if (resolved.state === 'unset') return null;
  // Slack and Azure DevOps have no probe, so they can never leave "not
  // tested" — and saying so reads as a fault rather than as an absence.
  // Presence is the only fact there is about them, so that is what it says.
  const copy =
    !probeable && resolved.state === 'untested'
      ? { ...resolved, label: 'key saved', detail: 'Saved. This connection has no live test.' }
      : resolved;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span
        title={copy.detail}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-body',
          TONE[copy.tone],
        )}
      >
        {copy.state === 'ok' && <Check className="size-2.5" aria-hidden="true" />}
        {copy.state === 'failed' && <X className="size-2.5" aria-hidden="true" />}
        {copy.label}
      </span>
      {onRetest && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1"
          disabled={busy}
          aria-label={label ? `Re-test ${label}` : 'Re-test this connection'}
          onClick={onRetest}
        >
          <RotateCw className={cn('size-3', busy && 'animate-spin')} aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}
