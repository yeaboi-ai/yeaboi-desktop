'use client';

// The connector sheet and tile — shared by the Integrations catalog and the
// Credentials tab's connected-integrations view. The sheet is the whole
// connect/edit flow: auth method first, then that method's fields, one
// "Save & test" writing through POST /api/settings/set and probing through
// the connection verify route. Rows managed by Credentials deep-link there;
// custom rows add delete, and webhook customs a delivery panel.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, RefreshCw, Trash2 } from 'lucide-react';
import {
  type ConnectionAuthMethod,
  type ConnectionRow,
  type WebhookUrlInfo,
  deleteCustomConnection,
  verifyConnectionKind,
  webhookUrl,
  webhooksStart,
  webhooksStatus,
} from '@/lib/yeaboi/connections';
import { saveSetting } from '@/lib/yeaboi/settings';
import { GuideLink } from '@/components/onboarding/guide-link';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { ChoicePills } from '@/components/settings/primitives';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** The tile's identity chip: a real logomark when the desktop ships one, the
 *  wire glyph for a user-created connection (its icon is the user's emoji). */
export function ConnectorMark({ row, size = 40 }: { row: ConnectionRow; size?: number }) {
  if (row.key.startsWith('custom_')) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/40"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      >
        {row.glyph || '🔌'}
      </span>
    );
  }
  // The one legacy key whose mark lives under another name: Azure DevOps
  // Boards is catalogued as `azdevops` but has always drawn the `azure` mark.
  return <ProviderIcon provider={row.key === 'azdevops' ? 'azure' : row.key} size={size} />;
}


/** One catalog tile. Monochrome at rest; hover/focus blooms the vendor accent
 *  through --tile-accent; a connected tile wears it permanently. */
export function ConnectorTile({ row, onOpen }: { row: ConnectionRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-connector={row.key}
      style={{ '--tile-accent': row.accent } as React.CSSProperties}
      className={cn(
        'group flex items-center gap-3.5 rounded-2xl bg-card px-4 py-3 text-left ring-1 transition-[box-shadow,ring-color] duration-150',
        'hover:ring-[var(--tile-accent)] hover:shadow-[0_0_16px_-6px_var(--tile-accent)]',
        'focus-visible:ring-[var(--tile-accent)] focus-visible:outline-none',
        row.connected
          ? 'ring-[var(--tile-accent)] shadow-[0_0_16px_-8px_var(--tile-accent)]'
          : 'ring-border/60',
      )}
    >
      <ConnectorMark row={row} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-body font-medium text-foreground">
            {row.label}
          </span>
          {row.connected && (
            <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
              connected
            </span>
          )}
          {row.read_only && (
            <span className="shrink-0 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground/80">
              read-only
            </span>
          )}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground/70">{row.summary}</span>
      </span>
    </button>
  );
}


// ---------------------------------------------------------------------------
// The connect sheet
// ---------------------------------------------------------------------------

export function ConnectorSheet({
  row,
  onClose,
  onChanged,
}: {
  row: ConnectionRow | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  return (
    <Sheet open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        {row && <ConnectorSheetBody row={row} onChanged={onChanged} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function ConnectorSheetBody({
  row,
  onChanged,
  onClose,
}: {
  row: ConnectionRow;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const methods = row.auth_methods;
  const [method, setMethod] = useState(
    () => methods.find((m) => m.recommended)?.key ?? methods[0]?.key ?? '',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const isCustom = row.key.startsWith('custom_');
  const isWebhook = isCustom && row.fields.some((f) => f.env.endsWith('_WEBHOOK_SECRET'));

  const active: ConnectionAuthMethod | undefined = methods.find((m) => m.key === method);
  const shownFields = row.fields.filter(
    (f) =>
      f.env !== row.auth_env && (!methods.length || !f.auth_method || f.auth_method === method),
  );
  const touched = shownFields.some((f) => (values[f.env] ?? '').trim());

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (row.auth_env && methods.length) await saveSetting(row.auth_env, method);
      for (const field of shownFields) {
        const value = (values[field.env] ?? '').trim();
        if (value) await saveSetting(field.env, value);
      }
      if (row.verify_kind) {
        const probe = await verifyConnectionKind(row.verify_kind);
        setResult(probe);
      } else {
        setResult({ ok: true, message: 'Saved — this connection has no live probe.' });
      }
      await onChanged();
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCustomConnection(row.key);
      await onChanged();
      onClose();
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader className="pr-12">
        <div className="flex items-center gap-3">
          <ConnectorMark row={row} size={44} />
          <div className="min-w-0">
            <SheetTitle className="truncate">{row.label}</SheetTitle>
            <p className="text-[11px] text-muted-foreground">
              {row.family_label}
              {row.read_only ? ' · read-only' : ''}
            </p>
          </div>
        </div>
        <SheetDescription className="pt-1 text-left">{row.detail || row.summary}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {row.docs_url && (
          <a
            href={row.docs_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground transition-colors hover:text-primary"
          >
            Where the credential comes from
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        )}

        {row.managed_by === 'credentials' ? (
          <div className="rounded-xl bg-secondary/40 px-4 py-3 text-[12px] text-muted-foreground">
            {row.label} is one of the built-in integrations — its credentials live under{' '}
            <Link href="/settings/credentials" className="text-primary hover:underline">
              Settings · Credentials
            </Link>
            {row.section === 'voice' ? ' (System · Voice)' : ''}, or re-run setup.
          </div>
        ) : (
          <>
            {methods.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                  How to connect
                </p>
                <ChoicePills
                  options={methods.map((m) => m.key)}
                  labels={Object.fromEntries(methods.map((m) => [m.key, m.label]))}
                  active={method}
                  onPick={setMethod}
                />
                {active && (
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                    {active.summary}
                  </p>
                )}
                {active?.warning && (
                  <p className="mt-1 text-[11px] leading-snug text-warning">⚠ {active.warning}</p>
                )}
                {active?.setup_url && <GuideLink url={active.setup_url} scope="" />}
              </div>
            )}

            {isWebhook ? (
              <WebhookPanel row={row} />
            ) : (
              <div className="space-y-3">
                {shownFields.map((field) => (
                  <label key={field.env} className="block">
                    <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                      {field.label}
                      {!field.required && ' (optional)'}
                    </span>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={values[field.env] ?? ''}
                      placeholder={
                        field.is_set && field.secret
                          ? 'saved — type to replace'
                          : field.placeholder || field.default
                      }
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.env]: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
                    />
                    {field.hint && (
                      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                        {field.hint}
                      </p>
                    )}
                    <GuideLink url={field.help_url} scope={field.help_scope} />
                  </label>
                ))}
              </div>
            )}

            {result && (
              <p
                role="status"
                className={cn('text-[12px]', result.ok ? 'text-success' : 'text-destructive')}
              >
                {result.message}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              {!isWebhook && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || (!touched && !row.connected)}
                  onClick={() => void saveAndTest()}
                >
                  {busy ? 'Testing…' : row.verify_kind ? 'Save & test' : 'Save'}
                </Button>
              )}
              {isCustom && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 aria-hidden className="mr-1 size-3.5" />
                  Remove
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The webhook panel — URL, secret, receiver state, delivery liveness
// ---------------------------------------------------------------------------

function WebhookPanel({ row }: { row: ConnectionRow }) {
  const [info, setInfo] = useState<WebhookUrlInfo | null>(null);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    try {
      setInfo(await webhookUrl(row.key));
      setNote('');
    } catch (e) {
      setNote((e as Error).message);
    }
  }, [row.key]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startReceiver = async () => {
    try {
      await webhooksStart();
      await webhooksStatus();
      await refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  if (!info) {
    return note ? (
      <p role="alert" className="text-[12px] text-destructive">
        {note}
      </p>
    ) : (
      <div className="h-24 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" />
    );
  }

  const copy = (value: string, what: string) => {
    void navigator.clipboard.writeText(value).then(() => setNote(`${what} copied`));
  };

  return (
    <div className="space-y-3">
      <WebhookFact
        label="Deliveries POST to"
        value={info.url}
        onCopy={() => copy(info.url, 'URL')}
      />
      {info.tunnel_url && (
        <WebhookFact
          label="Tunnel (rotates per share — for testing)"
          value={info.tunnel_url}
          onCopy={() => copy(info.tunnel_url, 'Tunnel URL')}
        />
      )}
      <WebhookFact
        label={`${info.header} (${info.verify})`}
        value={info.secret}
        secret
        onCopy={() => copy(info.secret, 'Secret')}
      />
      <div className="flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          {info.running
            ? info.last_received_at
              ? `Last delivery ${info.last_received_at.slice(0, 16).replace('T', ' ')}`
              : 'Receiver running — waiting for the first delivery'
            : 'The receiver is not running'}
        </p>
        {!info.running && (
          <Button size="xs" variant="outline" onClick={() => void startReceiver()}>
            <RefreshCw aria-hidden className="mr-1 size-3" />
            Start receiver
          </Button>
        )}
      </div>
      {note && (
        <p role="status" className="text-[11px] text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

function WebhookFact({
  label,
  value,
  secret = false,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary/40 px-3 py-2 font-mono text-[12px] text-foreground">
          {secret ? '•'.repeat(12) + value.slice(-4) : value}
        </code>
        <Button size="icon-xs" variant="ghost" aria-label={`Copy ${label}`} onClick={onCopy}>
          <Copy aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
