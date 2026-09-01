'use client';

// The integrations catalog — Settings > Integrations.
//
// One view: the whole roster from GET /api/connections?all=1, searchable,
// shelved by family, with a Create-your-own tile at the end. A connected
// integration wears its badge and accent here; managing what is already set
// up (masked fields, verify, edit) lives beside the other credentials on
// Settings > Credentials.
//
// The signature is the accent bloom: every tile is monochrome at rest, takes
// its vendor's accent on hover/focus (ring + soft glow through a per-tile
// CSS variable fed by the wire's `accent`), and wears it permanently once
// connected — colour encodes state, it never decorates.
//
// Connecting happens in a right-hand sheet: auth method first (it decides
// which fields are even asked), then that method's fields, one "Save & test"
// writing through POST /api/settings/set and probing through the connection
// verify route — the same flow ConnectionCard owns, restyled. Rows managed by
// Credentials deep-link there instead of duplicating their forms.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  type ConnectionAuthMethod,
  type ConnectionRow,
  type ConnectionsPayload,
  type CustomConnectionSpec,
  type WebhookUrlInfo,
  createCustomConnection,
  deleteCustomConnection,
  draftCustomConnection,
  loadConnections,
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
function ConnectorMark({ row, size = 40 }: { row: ConnectionRow; size?: number }) {
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

function matches(row: ConnectionRow, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    row.label.toLowerCase().includes(q) ||
    row.summary.toLowerCase().includes(q) ||
    row.family_label.toLowerCase().includes(q)
  );
}

export function IntegrationsCatalog() {
  const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [openKey, setOpenKey] = useState('');
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadConnections(true);
      setPayload(next);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => payload?.connectors ?? [], [payload]);
  const connected = rows.filter((row) => row.connected);
  const openRow = rows.find((row) => row.key === openKey) ?? null;

  const filtered = rows.filter((row) => matches(row, query) && (!family || row.family === family));
  const shelfFamilies = (payload?.families ?? []).filter((f) =>
    filtered.some((row) => row.family === f.key),
  );

  if (error) {
    // A backend that predates the route answers the router's generic 404 —
    // that is staleness, not breakage, and it must not read as red.
    return /404|not found/i.test(error) ? (
      <p role="status" className="text-[13px] text-muted-foreground">
        Your yeaboi backend predates the integrations catalog — update yeaboi to browse it.
      </p>
    ) : (
      <p role="alert" className="text-[12px] text-destructive">
        Could not load the catalog: {error}
      </p>
    );
  }
  if (!payload) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl bg-secondary/50 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/60"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the catalog"
              aria-label="Search the catalog"
              className="w-full rounded-lg border border-border/40 bg-secondary/40 py-2 pr-3 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
            />
          </label>
        </div>
        <p className="text-[12px] font-mono text-muted-foreground">
          {connected.length} of {rows.length} connected
        </p>
      </div>

      <div role="group" aria-label="Family filter" className="flex flex-wrap gap-1.5">
        <FamilyChip label="All" active={!family} onPick={() => setFamily('')} />
        {(payload?.families ?? []).map((f) => (
          <FamilyChip
            key={f.key}
            label={f.label}
            active={family === f.key}
            onPick={() => setFamily(family === f.key ? '' : f.key)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">
          Nothing matches — clear the search to see the whole catalog.
        </p>
      ) : (
        shelfFamilies.map((f, index) => (
          <section
            key={f.key}
            className="animate-slide-up motion-reduce:animate-none"
            style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'backwards' }}
          >
            <h3 className="mb-2 text-[10px] font-body tracking-[0.14em] text-muted-foreground uppercase">
              {f.label}
            </h3>
            <div className="grid gap-2 md:grid-cols-2">
              {filtered
                .filter((row) => row.family === f.key)
                .map((row) => (
                  <ConnectorTile key={row.key} row={row} onOpen={() => setOpenKey(row.key)} />
                ))}
            </div>
          </section>
        ))
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-border/70 bg-card/40 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary/30 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/40">
          <Plus aria-hidden className="size-5 text-muted-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-body font-medium text-foreground">
            Create your own
          </span>
          <span className="block text-[12px] text-muted-foreground/70">
            A generic API, an inbound webhook or an MCP server — describe it, or fill the form.
          </span>
        </span>
      </button>

      <ConnectorSheet row={openRow} onClose={() => setOpenKey('')} onChanged={refresh} />
      <CreateCustomSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(key) => {
          setCreating(false);
          void refresh().then(() => setOpenKey(key));
        }}
      />
    </div>
  );
}

function FamilyChip({
  label,
  active,
  onPick,
}: {
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-body transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none',
        active
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

/** One catalog tile. Monochrome at rest; hover/focus blooms the vendor accent
 *  through --tile-accent; a connected tile wears it permanently. */
function ConnectorTile({ row, onOpen }: { row: ConnectionRow; onOpen: () => void }) {
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

function ConnectorSheet({
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

// ---------------------------------------------------------------------------
// Create your own — LLM draft on top, the form underneath
// ---------------------------------------------------------------------------

const FAMILY_OPTIONS = [
  'observability',
  'incidents',
  'errors',
  'cloud',
  'delivery',
  'code',
  'docs',
  'chat',
  'media',
];

const EMPTY_SPEC: CustomConnectionSpec = {
  key: '',
  label: '',
  family: 'observability',
  summary: '',
  detail: '',
  docs_url: '',
  glyph: '🔌',
  accent: 'rgb(120,160,200)',
  kind: 'api',
  auth_scheme: 'bearer',
  header_name: '',
  probe_path: '/',
  probe_ok_status: 200,
  webhook_verify: 'token',
  events: null,
};

function CreateCustomSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [spec, setSpec] = useState<CustomConnectionSpec>(EMPTY_SPEC);
  const [problems, setProblems] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretOnce, setSecretOnce] = useState('');

  const set = (patch: Partial<CustomConnectionSpec>) =>
    setSpec((current) => ({ ...current, ...patch }));

  const draft = async () => {
    setDrafting(true);
    setProblems([]);
    try {
      const result = await draftCustomConnection(description);
      // A draft with problems pre-fills the form — never a dead end.
      setSpec({ ...EMPTY_SPEC, ...result.draft } as CustomConnectionSpec);
      setProblems(result.problems);
    } catch (e) {
      setProblems([(e as Error).message]);
    } finally {
      setDrafting(false);
    }
  };

  const create = async () => {
    setSaving(true);
    setProblems([]);
    try {
      const row = await createCustomConnection({
        ...spec,
        key:
          spec.key ||
          `custom_${spec.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')}`,
      });
      if (row.webhook_secret) {
        // Shown once here; /api/webhooks/{key}/url can show it again.
        setSecretOnce(row.webhook_secret);
        setTimeout(() => onCreated(row.key), 1200);
      } else {
        onCreated(row.key);
      }
    } catch (e) {
      // The validator's lines arrive joined with "; " — one per line reads better.
      setProblems((e as Error).message.split('; '));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>Create a connection</SheetTitle>
          <SheetDescription className="text-left">
            A read-only API yeaboi polls, or an inbound webhook it receives. Describe the service
            and let the draft fill the form, or fill it yourself — nothing saves until you create
            it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-secondary/30 p-3">
            <label className="block">
              <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                Describe the service
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="e.g. Rollbar — read new error items from api.rollbar.com"
                className="mt-1 w-full resize-none rounded-lg border border-border/40 bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
              />
            </label>
            <Button
              size="xs"
              variant="secondary"
              className="mt-2"
              disabled={drafting || !description.trim()}
              onClick={() => void draft()}
            >
              <Sparkles aria-hidden className="mr-1 size-3" />
              {drafting ? 'Drafting…' : 'Draft it for me'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={spec.label} onChange={(label) => set({ label })} />
            <Field
              label="Key"
              mono
              value={spec.key}
              placeholder="custom_…"
              onChange={(key) => set({ key })}
            />
            <SelectField
              label="Family"
              value={spec.family}
              options={FAMILY_OPTIONS}
              onChange={(family) => set({ family })}
            />
            <SelectField
              label="Kind"
              value={spec.kind}
              options={['api', 'webhook']}
              onChange={(kind) => set({ kind: kind as CustomConnectionSpec['kind'] })}
            />
            <Field
              label="Icon (emoji)"
              value={spec.glyph}
              onChange={(glyph) => set({ glyph })}
              className="col-span-1"
            />
            <Field
              label="Accent rgb(r,g,b)"
              mono
              value={spec.accent}
              onChange={(accent) => set({ accent })}
            />
          </div>
          <Field
            label="One-line summary"
            value={spec.summary}
            onChange={(summary) => set({ summary })}
          />
          <Field
            label="Docs URL (https, optional)"
            mono
            value={spec.docs_url ?? ''}
            onChange={(docs_url) => set({ docs_url })}
          />

          {spec.kind === 'api' ? (
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Auth scheme"
                value={spec.auth_scheme ?? 'bearer'}
                options={['bearer', 'basic', 'header']}
                onChange={(auth_scheme) =>
                  set({ auth_scheme: auth_scheme as CustomConnectionSpec['auth_scheme'] })
                }
              />
              {spec.auth_scheme === 'header' && (
                <Field
                  label="Header name"
                  mono
                  value={spec.header_name ?? ''}
                  onChange={(header_name) => set({ header_name })}
                />
              )}
              <Field
                label="Probe path"
                mono
                value={spec.probe_path ?? '/'}
                onChange={(probe_path) => set({ probe_path })}
                className="col-span-2"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Delivery auth"
                value={spec.webhook_verify ?? 'token'}
                options={['token', 'hmac']}
                onChange={(webhook_verify) =>
                  set({ webhook_verify: webhook_verify as CustomConnectionSpec['webhook_verify'] })
                }
              />
              <SelectField
                label="Event kind"
                value={spec.events?.kind ?? 'alert'}
                options={['incident', 'alert', 'error_spike', 'deploy', 'spend_change']}
                onChange={(kind) => set({ events: { title_path: '', ...spec.events, kind } })}
              />
              <Field
                label="Title path (dot path into a row)"
                mono
                value={spec.events?.title_path ?? ''}
                onChange={(title_path) =>
                  set({ events: { kind: 'alert', ...spec.events, title_path } })
                }
                className="col-span-2"
              />
            </div>
          )}

          {problems.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-[12px] text-destructive">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {secretOnce && (
            <p role="status" className="text-[12px] text-success">
              Created — the delivery secret is in the connection's panel (shown once here:{' '}
              <code className="font-mono">{secretOnce}</code>)
            </p>
          )}

          <Button
            size="sm"
            disabled={saving || !spec.label.trim() || !spec.summary.trim()}
            onClick={() => void create()}
          >
            {saving ? 'Creating…' : 'Create connection'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  mono = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none',
          mono && 'font-mono',
        )}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] text-foreground focus:ring-1 focus:ring-primary/40 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
