'use client';

// The connector sheet and tile — shared by the Integrations catalog and the
// Credentials tab's connected-integrations view. The sheet is the whole
// connect/edit flow, laid out as the sequence it really is: choose an auth
// method, collect the keys at the vendor, paste them, then one "Save & test"
// writing through POST /api/settings/set and probing through the connection
// verify route. Rows managed by Credentials deep-link there; custom rows add
// delete, and webhook customs a delivery panel.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  type ConnectionAuthMethod,
  type ConnectionField,
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** The tile's identity chip: a real logomark when the desktop ships one, the
 *  user's uploaded image or emoji for a user-created connection. */
export function ConnectorMark({ row, size = 40 }: { row: ConnectionRow; size?: number }) {
  if (row.key.startsWith('custom_')) {
    if (row.icon) {
      // A server-validated raster data URI (png/jpeg/webp, never SVG).
      return (
        <img
          src={row.icon}
          alt=""
          aria-hidden
          className="shrink-0 rounded-xl object-cover ring-1 ring-border/40"
          style={{ width: size, height: size }}
        />
      );
    }
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
  // The wire glyph rides along as the fallback identity for a key we ship no
  // logomark for (LaunchDarkly today).
  return (
    <ProviderIcon
      provider={row.key === 'azdevops' ? 'azure' : row.key}
      size={size}
      family={row.family}
      glyph={row.glyph}
    />
  );
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
      <SheetContent
        side="right"
        className="sm:max-w-lg"
        style={{ '--tile-accent': row?.accent } as React.CSSProperties}
      >
        {row && <ConnectorSheetBody row={row} onChanged={onChanged} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

/** One numbered stop on the sheet's rail. Numbering is computed from the
 *  steps a row actually has, so it always reads as the true sequence. */
function Step({
  number,
  title,
  last = false,
  stagger,
  children,
}: {
  number: number;
  title: string;
  last?: boolean;
  stagger: number;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex gap-3 animate-slide-up motion-reduce:animate-none',
        `stagger-${Math.min(stagger, 6)}`,
      )}
    >
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--tile-accent)_45%,transparent)]"
        >
          {number}
        </span>
        {!last && <span aria-hidden className="mt-1.5 w-px flex-1 bg-border/60" />}
      </div>
      <div className={cn('min-w-0 flex-1', last ? 'pb-1' : 'pb-6')}>
        <h3 className="text-[12px] font-body font-medium text-foreground">{title}</h3>
        <div className="mt-2.5">{children}</div>
      </div>
    </section>
  );
}

/** An external link in the "Get your keys" step, with its minimum-scope hint. */
function KeyLink({ label, url, scope }: { label: string; url: string; scope: string }) {
  return (
    <div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[12px] font-body text-foreground/90 transition-colors hover:text-primary"
      >
        {label}
        <ArrowUpRight
          aria-hidden
          className="size-3 text-[color-mix(in_srgb,var(--tile-accent)_80%,var(--color-foreground))]"
        />
      </a>
      {scope && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">{scope}</p>}
    </div>
  );
}

/** One credential field: label + saved state, then a select (when the wire
 *  declares choices), or an input with a reveal toggle when it is a secret. */
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ConnectionField;
  value: string;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const controlClass =
    'w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none';
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
          {field.label}
          {!field.required && ' (optional)'}
        </span>
        {field.is_set && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-success">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            saved
          </span>
        )}
      </span>
      {field.choices.length > 0 ? (
        <span className="relative mt-1 block">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cn(controlClass, 'appearance-none pr-9')}
          >
            <option value="">
              {field.is_set
                ? 'keep current'
                : field.default
                  ? `${field.default} (default)`
                  : 'choose…'}
            </option>
            {field.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground/60"
          />
        </span>
      ) : (
        <span className="relative mt-1 block">
          <input
            type={field.secret && !revealed ? 'password' : 'text'}
            value={value}
            placeholder={
              field.is_set && field.secret
                ? 'saved — type to replace'
                : field.placeholder || field.default
            }
            onChange={(event) => onChange(event.target.value)}
            className={cn(controlClass, field.secret && 'pr-9')}
          />
          {field.secret && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={revealed ? `Hide ${field.label}` : `Show ${field.label}`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground/60"
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          )}
        </span>
      )}
      {field.hint && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">{field.hint}</p>
      )}
    </label>
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
  const methods = row.auth_methods ?? [];
  const [method, setMethod] = useState(
    () => methods.find((m) => m.recommended)?.key ?? methods[0]?.key ?? '',
  );
  // The wire carries no in-force method, so the pill defaults to recommended —
  // which may not be what a connected row actually uses. Only a deliberate
  // pick (or a first-time connect) may rewrite the stored method env.
  const [methodTouched, setMethodTouched] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const isCustom = row.key.startsWith('custom_');
  const isWebhook = row.kind === 'webhook';
  const isManaged = row.managed_by === 'credentials';

  const active: ConnectionAuthMethod | undefined = methods.find((m) => m.key === method);
  const shownFields = (row.fields ?? []).filter(
    (f) =>
      f.env !== row.auth_env && (!methods.length || !f.auth_method || f.auth_method === method),
  );
  const touched = shownFields.some((f) => (values[f.env] ?? '').trim());

  // "Get your keys": the vendor docs page plus every create-a-key link the
  // shown fields carry, deduped — one purposeful block instead of a helper
  // line under each input.
  const keyLinks: { label: string; url: string; scope: string }[] = [];
  if (!isManaged) {
    if (row.docs_url) {
      keyLinks.push({ label: 'Where the credential comes from', url: row.docs_url, scope: '' });
    }
    for (const field of shownFields) {
      if (field.help_url && !keyLinks.some((k) => k.url === field.help_url)) {
        keyLinks.push({
          label: `Create ${field.label}`,
          url: field.help_url,
          scope: field.help_scope,
        });
      }
    }
  }

  const steps: { title: string; body: ReactNode }[] = [];
  if (!isManaged) {
    if (methods.length > 0) {
      steps.push({
        title: 'How to connect',
        body: (
          <div>
            <ChoicePills
              options={methods.map((m) => m.key)}
              labels={Object.fromEntries(methods.map((m) => [m.key, m.label]))}
              active={method}
              onPick={(key) => {
                setMethodTouched(true);
                setMethod(key);
              }}
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
        ),
      });
    }
    if (keyLinks.length > 0) {
      steps.push({
        title: 'Get your keys',
        body: (
          <div className="space-y-2.5">
            {keyLinks.map((link) => (
              <KeyLink key={link.url} {...link} />
            ))}
          </div>
        ),
      });
    }
    if (isWebhook) {
      steps.push({ title: 'Point deliveries here', body: <WebhookPanel row={row} /> });
    } else if (shownFields.length > 0) {
      steps.push({
        title: 'Paste them here',
        body: (
          <div className="space-y-3.5">
            {shownFields.map((field) => (
              <FieldControl
                key={field.env}
                field={field}
                value={values[field.env] ?? ''}
                onChange={(value) => setValues((current) => ({ ...current, [field.env]: value }))}
              />
            ))}
          </div>
        ),
      });
    }
  }

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (row.auth_env && methods.length && (methodTouched || !row.connected)) {
        await saveSetting(row.auth_env, method);
      }
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

  const showFooter = !isManaged && (!isWebhook || isCustom);

  return (
    <>
      {/* The identity band: the vendor's own accent, washed low so it sits on
          both light and dark cards. Semantic state stays on the theme tokens. */}
      <SheetHeader className="relative gap-3 overflow-hidden pr-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--tile-accent) 13%, transparent), transparent 62%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -left-8 size-44 rounded-full opacity-25 blur-2xl"
          style={{ background: 'radial-gradient(circle, var(--tile-accent), transparent 70%)' }}
        />
        <div className="relative flex items-start gap-3.5">
          <ConnectorMark row={row} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="truncate text-[17px] font-semibold">{row.label}</SheetTitle>
              {row.connected ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10.5px] text-success">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  connected
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-full bg-secondary/60 px-2 py-0.5 text-[10.5px] text-muted-foreground/70">
                  not connected
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                {row.family_label}
              </span>
              {row.read_only && (
                <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground/80">
                  read-only
                </span>
              )}
            </div>
          </div>
        </div>
        <SheetDescription className="relative text-left text-[12.5px] leading-relaxed">
          {row.detail || row.summary}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isManaged ? (
          <div className="space-y-4">
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
            <div className="rounded-xl bg-secondary/40 px-4 py-3 text-[12px] text-muted-foreground">
              {row.label} is one of the built-in integrations — its credentials live under{' '}
              <Link href="/settings/credentials" className="text-primary hover:underline">
                Settings · Set-up
              </Link>
              {row.section === 'voice' ? ' (System · Voice)' : ''}, or re-run setup.
            </div>
          </div>
        ) : (
          steps.map((step, index) => (
            <Step
              key={step.title}
              number={index + 1}
              title={step.title}
              last={index === steps.length - 1}
              stagger={index + 1}
            >
              {step.body}
            </Step>
          ))
        )}
      </div>

      {showFooter && (
        <SheetFooter className="gap-3">
          <p
            role="status"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] leading-snug',
              result ? (result.ok ? 'text-success' : 'text-destructive') : 'sr-only',
            )}
          >
            {result?.ok && <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />}
            {result && !result.ok && <AlertCircle aria-hidden className="size-3.5 shrink-0" />}
            {result?.message}
          </p>
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
          {!isWebhook && (
            <Button
              size="sm"
              disabled={busy || (!touched && !row.connected)}
              onClick={() => void saveAndTest()}
            >
              {busy && (
                <Loader2
                  aria-hidden
                  className="mr-1 size-3.5 animate-spin motion-reduce:animate-none"
                />
              )}
              {busy ? 'Testing…' : row.verify_kind ? 'Save & test' : 'Save'}
            </Button>
          )}
        </SheetFooter>
      )}
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
    void navigator.clipboard
      .writeText(value)
      .then(() => setNote(`${what} copied`))
      .catch(() => setNote('copy failed — clipboard permission denied'));
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
